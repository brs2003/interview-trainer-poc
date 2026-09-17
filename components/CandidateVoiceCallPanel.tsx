'use client';

import React, { useState, useEffect, useRef } from 'react';
import { InterviewerPersona, CandidateProfile, TranscriptItem, ChatMessage } from '@/lib/types';
import { isSpeechRecognitionSupported, createSpeechRecognition, speakWithVoiceTuning, sanitizeForSpeech, stopSpeaking } from '@/lib/speech';
import { Mic, MicOff, Volume2, Send, Square, AlertCircle, Bot, User, MessageSquare, ShieldAlert } from 'lucide-react';

interface CandidateVoiceCallPanelProps {
  persona: InterviewerPersona;
  candidateProfile: CandidateProfile;
  interviewerSystemPrompt: string;
  onEndInterview: (transcriptItems: TranscriptItem[], chatHistory: ChatMessage[]) => void;
}

export function CandidateVoiceCallPanel({
  persona,
  candidateProfile,
  interviewerSystemPrompt,
  onEndInterview,
}: CandidateVoiceCallPanelProps) {
  // Transcript state
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [spokenText, setSpokenText] = useState<string>('');

  // Call status state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState<boolean>(false);
  const [isLLMThinking, setIsLLMThinking] = useState<boolean>(false);

  // Errors & Fallbacks
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [browserSupported, setBrowserSupported] = useState<boolean>(true);
  const [manualInputText, setManualInputText] = useState<string>('');
  const [hasEnded, setHasEnded] = useState<boolean>(false);

  // Refs
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);
  const isInterviewerSpeakingRef = useRef<boolean>(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const interviewStatusRef = useRef<'active' | 'ended'>('active');
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const hasStartedRef = useRef<boolean>(false);

  const isInterviewEnded = () => interviewStatusRef.current === 'ended';

  const stopAllSideEffects = () => {
    if (isInterviewEnded()) return;
    interviewStatusRef.current = 'ended';

    stopSpeaking();

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    streamReaderRef.current?.cancel().catch(() => {});
    streamReaderRef.current = null;

    isListeningRef.current = false;
    isInterviewerSpeakingRef.current = false;

    const rec = recognitionRef.current;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }
  };

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    isInterviewerSpeakingRef.current = isInterviewerSpeaking;
  }, [isInterviewerSpeaking]);

  useEffect(() => {
    const supported = isSpeechRecognitionSupported();
    setBrowserSupported(supported);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptItems, interimText, isLLMThinking, spokenText]);

  // Combined with the opening-question kickoff below so both reset atomically —
  // React 18 Strict Mode's dev-only double-invoke (mount -> cleanup -> mount)
  // would otherwise abort the first fetch via stopAllSideEffects() while a
  // ref-based "already started" guard (which survives the simulated remount)
  // permanently blocked any retry, leaving the panel stuck on "thinking...".
  // Resetting hasStartedRef in this same cleanup lets the settling remount
  // fire exactly one real request.
  useEffect(() => {
    interviewStatusRef.current = 'active';

    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      fetchInterviewerReply([{ role: 'system', content: interviewerSystemPrompt }]);
    }

    return () => {
      stopAllSideEffects();
      hasStartedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;

    const rec = createSpeechRecognition();
    if (!rec) return null;

    rec.onstart = () => {
      if (isInterviewEnded()) return;
      setIsListening(true);
      setPermissionError(null);
    };

    rec.onresult = (event: any) => {
      if (isInterviewEnded()) return;

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart;
        } else {
          interimTranscript += transcriptPart;
        }
      }

      if (interimTranscript) {
        setInterimText(interimTranscript);
      }

      if (finalTranscript && finalTranscript.trim().length > 0) {
        setInterimText('');
        handleCandidateAnswer(finalTranscript.trim());
      }
    };

    rec.onerror = (event: any) => {
      if (isInterviewEnded()) return;

      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setPermissionError('Microphone permission was denied. Please allow microphone access in your browser bar.');
        setIsListening(false);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setApiError(`Speech recognition error: ${event.error}`);
      }
    };

    rec.onend = () => {
      if (isInterviewEnded()) return;

      setIsListening(false);
      if (isListeningRef.current && !isInterviewerSpeakingRef.current) {
        try {
          rec.start();
        } catch (e) {
          // ignore double start
        }
      }
    };

    recognitionRef.current = rec;
    return rec;
  };

  const toggleListening = () => {
    if (!browserSupported || isInterviewEnded()) return;

    if (isListening) {
      setIsListening(false);
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    } else {
      const rec = initRecognition();
      if (rec) {
        try {
          setPermissionError(null);
          rec.start();
          setIsListening(true);
          isListeningRef.current = true;
        } catch (e) {
          console.error('Start recognition error:', e);
        }
      }
    }
  };

  // Requests the interviewer's next line from the given full message history
  // (system prompt + conversation so far) and speaks it aloud in character.
  const fetchInterviewerReply = async (fullMessages: ChatMessage[]) => {
    setIsLLMThinking(true);
    setApiError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: fullMessages,
          options: {
            temperature: 0.8,
            max_tokens: 400,
          },
          stream: true,
        }),
        signal: controller.signal,
      });

      if (isInterviewEnded()) return;

      if (!response.ok) {
        let errMsg = 'Failed to get response from interviewer AI.';
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
      let interviewerReplyRaw = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (isInterviewEnded()) {
          await reader.cancel().catch(() => {});
          break;
        }

        interviewerReplyRaw += decoder.decode(value, { stream: true });
      }

      streamReaderRef.current = null;

      if (isInterviewEnded()) return;

      setIsLLMThinking(false);

      const interviewerReplyText = sanitizeForSpeech(interviewerReplyRaw);

      if (!interviewerReplyText) {
        throw new Error('Interviewer AI returned an empty response.');
      }

      const interviewerTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const commitInterviewerReply = () => {
        const interviewerTranscriptItem: TranscriptItem = {
          id: `intv_${Date.now()}`,
          speaker: 'interviewer',
          text: interviewerReplyText,
          timestamp: interviewerTimestamp,
        };

        setTranscriptItems((prev) => [...prev, interviewerTranscriptItem]);
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: interviewerReplyText, timestamp: interviewerTimestamp },
        ]);
        setSpokenText('');
      };

      setIsInterviewerSpeaking(true);
      isInterviewerSpeakingRef.current = true;
      setSpokenText('');

      speakWithVoiceTuning(
        interviewerReplyText,
        persona.voice,
        () => {
          if (isInterviewEnded()) return;

          commitInterviewerReply();
          setIsInterviewerSpeaking(false);
          isInterviewerSpeakingRef.current = false;

          if (isListeningRef.current && browserSupported) {
            const rec = initRecognition();
            if (rec) {
              try {
                rec.start();
              } catch (e) {
                // ignore
              }
            }
          }
        },
        (err) => {
          if (isInterviewEnded()) return;

          console.error('TTS error:', err);
          commitInterviewerReply();
          setIsInterviewerSpeaking(false);
          isInterviewerSpeakingRef.current = false;
        },
        isInterviewEnded,
        (charIndex) => {
          if (isInterviewEnded()) return;
          setSpokenText(interviewerReplyText.slice(0, charIndex));
        }
      );
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

  // Handle candidate (the human user) answering the interviewer's question
  const handleCandidateAnswer = async (answerText: string) => {
    if (!answerText.trim() || isInterviewEnded()) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const candidateTranscriptItem: TranscriptItem = {
      id: `cand_${Date.now()}`,
      speaker: 'candidate',
      text: answerText,
      timestamp,
    };

    setTranscriptItems((prev) => [...prev, candidateTranscriptItem]);

    const updatedHistory: ChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: answerText, timestamp },
    ];
    setChatHistory(updatedHistory);

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: interviewerSystemPrompt },
      ...updatedHistory.map((h) => ({ role: h.role, content: h.content })),
    ];

    await fetchInterviewerReply(fullMessages);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInterviewEnded()) return;
    if (manualInputText.trim()) {
      const text = manualInputText;
      setManualInputText('');
      handleCandidateAnswer(text);
    }
  };

  const handleEnd = () => {
    stopAllSideEffects();

    setIsListening(false);
    setIsInterviewerSpeaking(false);
    setIsLLMThinking(false);
    setSpokenText('');
    setInterimText('');
    setHasEnded(true);

    onEndInterview(transcriptItems, chatHistory);
  };

  const busy = isInterviewerSpeaking || isLLMThinking || hasEnded;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">

      {!browserSupported && (
        <div className="p-4 rounded-lg bg-white border border-hairline text-olive text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-muted shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Speech recognition not supported</div>
            <div className="text-muted text-sm mt-1">
              Your current browser does not support the Web Speech API. For a hands-free voice experience, please open this app in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>. You can still use the text input below to practice.
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
            <div className="font-medium">Interviewer response error</div>
            <div className="text-muted text-sm mt-1">{apiError}</div>
          </div>
        </div>
      )}

      {/* Interviewer Persona Card */}
      <div className="bg-white border border-hairline rounded-xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-cream border border-hairline flex items-center justify-center shrink-0">
          <Bot className="w-6 h-6 text-olive" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-olive">{persona.name}</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-cream text-muted border border-hairline">
              {persona.title} &bull; {persona.difficulty}
            </span>
          </div>
          <p className="text-sm text-muted mt-1 line-clamp-1">
            Interviewing you for: {candidateProfile.role} ({candidateProfile.experience} yrs)
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
          {transcriptItems.length === 0 && !isLLMThinking && !isInterviewerSpeaking ? (
            <div className="h-full flex flex-col items-center justify-center text-muted text-center px-4">
              <Bot className="w-9 h-9 mb-2 stroke-1" />
              <p className="text-sm font-medium text-olive">Waiting for {persona.name} to begin&hellip;</p>
            </div>
          ) : (
            transcriptItems.map((item) => (
              <div
                key={item.id}
                className={`flex gap-3 py-4 first:pt-0 ${
                  item.speaker === 'interviewer' ? 'bg-cream/60 -mx-6 px-6' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-hairline flex items-center justify-center shrink-0">
                  {item.speaker === 'interviewer' ? (
                    <Bot className="w-4 h-4 text-olive" />
                  ) : (
                    <User className="w-4 h-4 text-olive" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 text-xs text-muted font-medium mb-1">
                    <span>{item.speaker === 'interviewer' ? persona.name : 'You (candidate)'}</span>
                    <span>{item.timestamp}</span>
                  </div>
                  <p className="text-sm text-olive leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))
          )}

          {isLLMThinking && (
            <div className="flex gap-3 items-center py-4">
              <div className="w-8 h-8 rounded-lg bg-white border border-hairline flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-olive" />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <div className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin"></div>
                <span>{persona.name} is thinking&hellip;</span>
              </div>
            </div>
          )}

          {isInterviewerSpeaking && (
            <div className="flex gap-3 py-4">
              <div className="w-8 h-8 rounded-lg bg-white border border-hairline flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4 text-olive" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4 text-xs text-muted font-medium mb-1">
                  <span>{persona.name}</span>
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

        {interimText && (
          <div className="mt-3 px-4 py-2 rounded-full bg-cream border border-hairline text-muted text-sm max-w-full truncate">
            <span className="text-olive font-medium mr-2">Hearing:</span> &quot;{interimText}&quot;
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="mt-4 pt-3 border-t border-hairline flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleListening}
              disabled={!browserSupported || busy}
              title={isListening ? 'Stop listening' : 'Start speaking'}
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isListening
                  ? 'bg-terracotta text-white'
                  : 'bg-cream border border-hairline text-olive hover:border-terracotta/60'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            <div className="hidden md:flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
              {isInterviewerSpeaking ? (
                <span className="flex items-center gap-1.5 text-olive">
                  <Volume2 className="w-3.5 h-3.5" />
                  {persona.name} speaking&hellip;
                </span>
              ) : isLLMThinking ? (
                <span className="flex items-center gap-1.5 text-muted">
                  <div className="w-3 h-3 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                  Thinking&hellip;
                </span>
              ) : isListening ? (
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
            placeholder="Type your answer if mic is disabled or noisy..."
            disabled={busy}
            className="flex-1 min-w-[140px] bg-cream border border-hairline rounded-lg px-4 py-2.5 text-sm text-olive placeholder-muted/70 focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta"
          />
          <button
            type="submit"
            disabled={!manualInputText.trim() || busy}
            className="px-4 py-2.5 rounded-lg bg-olive hover:bg-olive-light text-cream font-medium text-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Answer</span>
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between bg-white border border-hairline p-4 rounded-xl">
        <div className="text-sm text-muted">
          Ready to review your candidate performance scoring?
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
