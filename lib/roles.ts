export interface RoleGroup {
  group: string;
  roles: string[];
}

export const ROLE_GROUPS: RoleGroup[] = [
  {
    group: 'Engineering',
    roles: [
      'Data Engineer',
      'DevOps Engineer',
      'Cloud Engineer',
      'Backend Engineer',
      'Frontend Engineer (Next.js/React)',
      'Full-Stack Engineer',
      'Mobile Engineer (iOS/Android)',
      'QA/Test Engineer',
      'Site Reliability Engineer',
      'Security Engineer',
      'ML/AI Engineer',
      'Solutions Architect',
    ],
  },
  {
    group: 'Product & Design',
    roles: [
      'Product Manager',
      'UX/UI Designer',
      'Business Analyst',
      'Product Owner',
      'Technical Program Manager',
    ],
  },
  {
    group: 'Data & Analytics',
    roles: [
      'Data Analyst',
      'Data Scientist',
      'BI Analyst',
      'Analytics Engineer',
    ],
  },
  {
    group: 'Marketing',
    roles: [
      'Digital Marketing Specialist',
      'Content Marketing Manager',
      'SEO/SEM Specialist',
      'Growth Marketing Manager',
    ],
  },
  {
    group: 'Finance',
    roles: [
      'Financial Analyst',
      'Accountant',
      'Finance Manager',
      'FP&A Analyst',
    ],
  },
  {
    group: 'Sales & Client Services',
    roles: [
      'Sales Executive',
      'Account Manager',
      'Business Development Manager',
      'Customer Success Manager',
    ],
  },
  {
    group: 'HR & Operations',
    roles: [
      'HR Business Partner',
      'Talent Acquisition Specialist',
      'Operations Manager',
      'Project Manager',
      'Program Manager',
    ],
  },
  {
    group: 'Consulting & Support',
    roles: [
      'Management Consultant',
      'IT Support Specialist',
      'Technical Support Engineer',
    ],
  },
];

export const EXPERIENCE_RANGES: string[] = [
  '0-1',
  '1-2',
  '2-3',
  '3-4',
  '4-5',
  '5-6',
  '6-7',
  '7-8',
  '8-9',
  '9-10',
  '10+',
];
