'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Persona, TranscriptItem, ChatMessage } from '@/lib/types';
import { useVoiceInput } from '@/lib/voiceInput';
import { createSpeechStream, stopSpeaking, extractCompleteSentences, SpeechStreamHandle } from '@/lib/voiceOutput';
import { CANDIDATE_GENDER_VOICE_IDS } from '@/lib/voices';
import { markTiming } from '@/lib/timing';
import { Avatar } from '@/components/Avatar';
import { MicWaveform } from '@/components/MicWaveform';
import { Mic, MicOff, Volume2, Send, Square, AlertCircle, Bot, User, MessageSquare, ShieldAlert } from 'lucide-react';

interface VoiceCallPanelProps {
  role: string;
  years: string;
  persona: Persona;
  personaSystemPrompt: string;
  onEndInterview: (transcriptItems: TranscriptItem[], chatHistory: ChatMessage[]) => void;
}

export function VoiceCallPanel({
  role,
  years,
  persona,
  personaSystemPrompt,
  onEndInterview,
}: VoiceCallPanelProps) {
  // Transcript state
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  // Text revealed so far, in sync with TTS playback (via ElevenLabs character
  // timing alignment) rather than with how fast the LLM streamed tokens —
  // this is what makes the transcript appear to "type" at the same pace the
  // candidate is speaking.
  const [spokenText, setSpokenText] = useState<string>('');

  // Call status state
  const [micToggleOn, setMicToggleOn] = useState<boolean>(false);
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState<boolean>(false);
  const [isLLMThinking, setIsLLMThinking] = useState<boolean>(false);

  // Errors & Fallbacks
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState<boolean>(true);
  const [manualInputText, setManualInputText] = useState<string>('');
  const [hasEnded, setHasEnded] = useState<boolean>(false);
  // Best-effort preview of the mic transcript while still recording (see
  // useVoiceInput's onInterimTranscript) — replaced by the real transcript
  // item once the final, authoritative transcription lands.
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Single source of truth for interview lifecycle. A ref (not state) so every
  // async callback — mic transcripts, TTS callbacks, in-flight fetch
  // continuations — can synchronously check it before acting, with no race window.
  const interviewStatusRef = useRef<'active' | 'ended'>('active');
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Read through a function (not a direct comparison) everywhere else so
  // TypeScript can't narrow the ref's literal type across control flow —
  // the ref's value can change between any two checks, direct `=== 'ended'`
  // comparisons after an earlier check get (incorrectly) flagged as unreachable.
  const isInterviewEnded = () => interviewStatusRef.current === 'ended';

  // The mic should only actually be capturing when the user has it toggled on
  // AND nobody else is talking/being generated for — this is what's passed to
  // the recording hook, so it starts/stops the mic stream automatically.
  const micActive = micToggleOn && !isCandidateSpeaking && !isLLMThinking && !hasEnded && micSupported;

  // Idempotent teardown of every live side effect: TTS and the in-flight LLM
  // request. Safe to call multiple times and safe to call from an unmount cleanup.
  const stopAllSideEffects = () => {
    if (isInterviewEnded()) return;
    interviewStatusRef.current = 'ended';

    stopSpeaking();

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    streamReaderRef.current?.cancel().catch(() => {});
    streamReaderRef.current = null;
  };

  // Check mic support on mount
  useEffect(() => {
    setMicSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Clear any stale interim preview once the mic actually stops listening.
  useEffect(() => {
    if (!micActive) setInterimTranscript('');
  }, [micActive]);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptItems, isLLMThinking, spokenText]);

  // Cleanup on unmount — catches navigation away from this screen by any path
  // (not just the "End Interview" button), so the interview can never keep
  // listening/speaking/generating in the background after this screen is gone.
  useEffect(() => {
    // Reset on every (re)mount so React 18 Strict Mode's dev-only
    // mount -> cleanup -> remount cycle doesn't leave the interview
    // permanently marked 'ended' after the simulated cleanup below runs.
    interviewStatusRef.current = 'active';

    return () => {
      stopAllSideEffects();
    };
  }, []);

  const { levels, isTranscribing } = useVoiceInput({
    active: micActive,
    onTranscript: (text) => {
      if (isInterviewEnded()) return;
      setInterimTranscript('');
      handleInterviewerQuestion(text);
    },
    onInterimTranscript: (text) => {
      if (isInterviewEnded()) return;
      setInterimTranscript(text);
    },
    onError: (message) => {
      if (isInterviewEnded()) return;
      setApiError(message);
    },
    onPermissionDenied: () => {
      if (isInterviewEnded()) return;
      setPermissionError('Microphone permission was denied. Please allow microphone access in your browser bar.');
      setMicToggleOn(false);
    },
  });

  // Toggle Microphone
  const toggleListening = () => {
    if (!micSupported || isInterviewEnded()) return;
    setPermissionError(null);
    setMicToggleOn((prev) => !prev);
  };

  // Handle Interviewer Question Submission
  const handleInterviewerQuestion = async (questionText: string) => {
    if (!questionText.trim() || isInterviewEnded()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userTranscriptItem: TranscriptItem = {
      id: `usr_${Date.now()}`,
      speaker: 'interviewer',
      text: questionText,
      timestamp,
    };

    setTranscriptItems((prev) => [...prev, userTranscriptItem]);

    const updatedHistory: ChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: questionText, timestamp },
    ];
    setChatHistory(updatedHistory);

    setIsLLMThinking(true);
    setApiError(null);
    markTiming('llm-request-sent');

    // Own this request's abort signal. If "End Interview" fires while this is
    // in flight, the fetch is aborted and every check below stops it from
    // touching state or triggering a further candidate response.
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const fullMessages: ChatMessage[] = [
        { role: 'system', content: personaSystemPrompt },
        ...updatedHistory.map((h) => ({ role: h.role, content: h.content })),
      ];

      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: fullMessages,
          options: {
            temperature: 0.7,
            max_tokens: 500,
          },
          stream: true,
        }),
        signal: controller.signal,
      });

      if (isInterviewEnded()) return;

      if (!response.ok) {
        let errMsg = 'Failed to get response from candidate AI.';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          // ignore — body wasn't JSON
        }
        throw new Error(errMsg);
      }

      if (!response.body) {
        throw new Error('Streaming response did not include a readable body.');
      }

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      let candidateReplyText = '';
      let sentenceBuffer = '';
      let firstTokenSeen = false;
      let speechQueue: SpeechStreamHandle | null = null;
      let candidateTimestamp = '';

      // Commits the finished reply into the permanent transcript/history and
      // tears down the transient "speaking" reveal state. Shared by the TTS
      // onEnd and onError paths so the text lands even if audio playback fails.
      const commitCandidateReply = () => {
        const candidateTranscriptItem: TranscriptItem = {
          id: `cand_${Date.now()}`,
          speaker: 'candidate',
          text: candidateReplyText,
          timestamp: candidateTimestamp,
        };

        setTranscriptItems((prev) => [...prev, candidateTranscriptItem]);
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: candidateReplyText, timestamp: candidateTimestamp },
        ]);
        setSpokenText('');
      };

      const voiceId = CANDIDATE_GENDER_VOICE_IDS[persona.gender || 'female'];

      // Lazily starts speech playback the moment the first complete sentence
      // is available, instead of waiting for the whole reply to finish
      // generating — this is what lets TTS overlap with LLM generation.
      const ensureSpeechQueue = () => {
        if (speechQueue) return speechQueue;
        candidateTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setIsLLMThinking(false);
        setIsCandidateSpeaking(true);
        setSpokenText('');
        speechQueue = createSpeechStream(
          voiceId,
          () => {
            if (isInterviewEnded()) return;
            commitCandidateReply();
            setIsCandidateSpeaking(false);
          },
          (err) => {
            if (isInterviewEnded()) return;
            console.error('TTS error:', err);
            commitCandidateReply();
            setIsCandidateSpeaking(false);
          },
          isInterviewEnded,
          (charIndex) => {
            if (isInterviewEnded()) return;
            setSpokenText(candidateReplyText.slice(0, charIndex));
          }
        );
        return speechQueue;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (isInterviewEnded()) {
          await reader.cancel().catch(() => {});
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (!firstTokenSeen && chunk) {
          firstTokenSeen = true;
          markTiming('llm-first-token');
        }
        candidateReplyText += chunk;
        sentenceBuffer += chunk;

        const { sentences, remainder } = extractCompleteSentences(sentenceBuffer);
        sentenceBuffer = remainder;
        for (const sentence of sentences) {
          if (isInterviewEnded()) break;
          ensureSpeechQueue().push(sentence);
        }
      }

      streamReaderRef.current = null;

      if (isInterviewEnded()) return;

      if (!candidateReplyText.trim()) {
        setIsLLMThinking(false);
        throw new Error('Candidate AI returned an empty response.');
      }

      if (sentenceBuffer.trim()) {
        ensureSpeechQueue().push(sentenceBuffer);
      }
      ensureSpeechQueue().end();
    } catch (err: unknown) {
      streamReaderRef.current = null;
      if (isInterviewEnded() || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      setIsLLMThinking(false);
      setSpokenText('');
      const errMsg = err instanceof Error ? err.message : 'Error calling OpenRouter AI service.';
      setApiError(errMsg);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInterviewEnded()) return;
    if (manualInputText.trim()) {
      const text = manualInputText;
      setManualInputText('');
      handleInterviewerQuestion(text);
    }
  };

  const handleEnd = () => {
    // Terminate the lifecycle synchronously first — every in-flight callback
    // (mic transcript, TTS callbacks, the LLM fetch continuation) checks
    // this ref and will no-op even if it resolves after this point.
    stopAllSideEffects();

    setMicToggleOn(false);
    setIsCandidateSpeaking(false);
    setIsLLMThinking(false);
    setSpokenText('');
    setHasEnded(true);

    onEndInterview(transcriptItems, chatHistory);
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">

      {!micSupported && (
        <div className="p-4 rounded-lg bg-white border border-hairline text-olive text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-muted shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Microphone access not supported</div>
            <div className="text-muted text-sm mt-1">
              Your current browser does not support microphone capture. You can still use the text input below to practice.
            </div>
          </div>
        </div>
      )}

      {permissionError && (
        <div className="p-4 rounded-lg bg-terracotta-light border border-terracotta/30 text-olive text-sm flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-terracotta-dark shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Microphone access denied</div>
            <div className="text-muted text-sm mt-1">{permissionError}</div>
          </div>
        </div>
      )}

      {apiError && (
        <div className="p-4 rounded-lg bg-terracotta-light border border-terracotta/30 text-olive text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-terracotta-dark shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Candidate response error</div>
            <div className="text-muted text-sm mt-1">{apiError}</div>
          </div>
        </div>
      )}

      {/* Candidate Persona Card */}
      <div className="bg-white border border-hairline rounded-xl p-5 flex items-center gap-4">
        <Avatar name={persona.name || 'Candidate'} size="md" speaking={isCandidateSpeaking} thinking={isLLMThinking} />

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-olive">{persona.name || 'Candidate persona'}</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-cream text-muted border border-hairline">
              {role} ({years} yrs)
            </span>
          </div>
          <p className="text-sm text-muted mt-1 line-clamp-1">
            Style: {persona.speaking_style || 'Conversational & direct'}
          </p>
        </div>
      </div>

      {/* Live Scrolling Transcript Panel */}
      <div className="bg-white border border-hairline rounded-xl p-6 flex flex-col h-[400px]">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-olive" />
            <h3 className="font-semibold text-olive text-sm">Live interview transcript</h3>
            <span className="text-sm text-muted">({transcriptItems.length} turns)</span>
          </div>

          <div className="text-sm text-muted">
            Recorded for evaluation
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-hairline">
          {transcriptItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted text-center px-4">
              <Bot className="w-9 h-9 mb-2 stroke-1" />
              <p className="text-sm font-medium text-olive">No interview questions asked yet</p>
              <p className="text-sm text-muted mt-1 max-w-sm">
                Start by introducing yourself or asking a question relevant to a {years} yrs exp {role}.
              </p>
            </div>
          ) : (
            transcriptItems.map((item) => (
              <div
                key={item.id}
                className={`flex gap-3 py-4 first:pt-0 ${
                  item.speaker === 'interviewer' ? 'bg-cream/60 -mx-6 px-6' : ''
                }`}
              >
                {item.speaker === 'interviewer' ? (
                  <div className="w-8 h-8 rounded-lg bg-white border border-hairline flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-olive" />
                  </div>
                ) : (
                  <Avatar name={persona.name || 'Candidate'} size="sm" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 text-xs text-muted font-medium mb-1">
                    <span>{item.speaker === 'interviewer' ? 'Interviewer (you)' : `${persona.name || 'Candidate'}`}</span>
                    <span>{item.timestamp}</span>
                  </div>
                  <p className="text-sm text-olive leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))
          )}

          {isLLMThinking && (
            <div className="flex gap-3 items-center py-4">
              <Avatar name={persona.name || 'Candidate'} size="sm" thinking />
              <div className="flex items-center gap-2 text-sm text-muted">
                <div className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin"></div>
                <span>{persona.name || 'Candidate'} is formulating an answer&hellip;</span>
              </div>
            </div>
          )}

          {isCandidateSpeaking && (
            <div className="flex gap-3 py-4">
              <Avatar name={persona.name || 'Candidate'} size="sm" speaking />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4 text-xs text-muted font-medium mb-1">
                  <span>{persona.name || 'Candidate'}</span>
                </div>
                <p className="text-sm text-olive leading-relaxed">
                  {spokenText}
                  <span className="inline-block w-1.5 h-4 align-middle ml-0.5 bg-olive animate-pulse" />
                </p>
              </div>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {isTranscribing && (
          <div className="mt-3 px-4 py-2 rounded-full bg-cream border border-hairline text-muted text-sm max-w-full flex items-center gap-2 w-fit">
            <div className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin"></div>
            <span>Transcribing your question&hellip;</span>
          </div>
        )}

        {!isTranscribing && interimTranscript && !hasEnded && (
          <div className="mt-3 px-4 py-2 rounded-full bg-cream border border-hairline text-olive text-sm max-w-full w-fit">
            {interimTranscript}
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="mt-4 pt-3 border-t border-hairline flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleListening}
              disabled={!micSupported || isCandidateSpeaking || isLLMThinking || hasEnded}
              title={micActive ? 'Stop listening' : 'Start speaking'}
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                micActive
                  ? 'bg-terracotta text-white'
                  : 'bg-cream border border-hairline text-olive hover:border-terracotta/60'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            <MicWaveform active={micActive} levels={levels} />

            {/* Mic / candidate status, anchored right next to the mic control */}
            <div className="hidden md:flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
              {isCandidateSpeaking ? (
                <span className="flex items-center gap-1.5 text-olive">
                  <Volume2 className="w-3.5 h-3.5" />
                  Speaking&hellip;
                </span>
              ) : isLLMThinking ? (
                <span className="flex items-center gap-1.5 text-muted">
                  <div className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                  Thinking&hellip;
                </span>
              ) : micActive ? (
                <span className="flex items-center gap-1.5 text-terracotta-dark">
                  <span className="w-2 h-2 rounded-full bg-terracotta" />
                  Mic on
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted">
                  <MicOff className="w-3.5 h-3.5" />
                  Mic off
                </span>
              )}
            </div>
          </div>

          <input
            type="text"
            value={manualInputText}
            onChange={(e) => setManualInputText(e.target.value)}
            placeholder="Type a question manually if mic is disabled or noisy..."
            disabled={isLLMThinking || isCandidateSpeaking || hasEnded}
            className="flex-1 min-w-[140px] bg-cream border border-hairline rounded-lg px-4 py-2.5 text-sm text-olive placeholder-muted/70 focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta"
          />
          <button
            type="submit"
            disabled={!manualInputText.trim() || isLLMThinking || isCandidateSpeaking || hasEnded}
            className="px-4 py-2.5 rounded-lg bg-olive hover:bg-olive-light text-cream font-medium text-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between bg-white border border-hairline p-4 rounded-xl">
        <div className="text-sm text-muted">
          Ready to review your interviewer scoring?
        </div>

        <button
          onClick={handleEnd}
          disabled={transcriptItems.length === 0 || hasEnded}
          className="px-5 py-2.5 rounded-lg bg-terracotta hover:bg-terracotta-dark text-white font-semibold text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Square className="w-4 h-4 fill-white" />
          <span>End interview & evaluate</span>
        </button>
      </div>

    </div>
  );
}
