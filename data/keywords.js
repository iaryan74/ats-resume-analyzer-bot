/**
 * Common keyword lists for ATS analysis.
 * Used as reference vocabulary to extract and match JD keywords.
 */

const PROGRAMMING_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'c',
  'ruby', 'go', 'golang', 'rust', 'swift', 'kotlin', 'php', 'scala',
  'perl', 'r', 'matlab', 'dart', 'lua', 'haskell', 'elixir', 'clojure',
  'objective-c', 'shell', 'bash', 'powershell', 'sql', 'html', 'css',
  'sass', 'less', 'graphql', 'solidity', 'assembly',
];

const FRAMEWORKS_AND_LIBRARIES = [
  'react', 'reactjs', 'react.js', 'angular', 'angularjs', 'vue', 'vuejs',
  'vue.js', 'next.js', 'nextjs', 'nuxt', 'nuxtjs', 'svelte', 'gatsby',
  'express', 'expressjs', 'nestjs', 'fastify', 'koa', 'django', 'flask',
  'fastapi', 'spring', 'spring boot', 'springboot', 'rails', 'ruby on rails',
  'laravel', 'symfony', '.net', 'asp.net', 'blazor', 'flutter', 'react native',
  'ionic', 'electron', 'qt', 'tkinter', 'pygame', 'unity', 'unreal',
  'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy',
  'matplotlib', 'opencv', 'huggingface', 'langchain', 'bootstrap',
  'tailwind', 'tailwindcss', 'material ui', 'mui', 'chakra ui', 'ant design',
  'jquery', 'three.js', 'redux', 'zustand', 'mobx', 'rxjs',
];

const TOOLS_AND_PLATFORMS = [
  'git', 'github', 'gitlab', 'bitbucket', 'docker', 'kubernetes', 'k8s',
  'jenkins', 'travis ci', 'circle ci', 'github actions', 'terraform',
  'ansible', 'puppet', 'chef', 'vagrant', 'aws', 'amazon web services',
  'azure', 'gcp', 'google cloud', 'firebase', 'heroku', 'vercel',
  'netlify', 'digitalocean', 'cloudflare', 'nginx', 'apache',
  'linux', 'ubuntu', 'centos', 'windows server', 'macos',
  'vs code', 'visual studio', 'intellij', 'eclipse', 'vim', 'emacs',
  'postman', 'swagger', 'insomnia', 'jira', 'confluence', 'trello',
  'slack', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator',
  'webpack', 'vite', 'babel', 'eslint', 'prettier', 'npm', 'yarn', 'pnpm',
  'pip', 'conda', 'maven', 'gradle', 'cmake', 'make',
];

const DATABASES = [
  'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch',
  'sqlite', 'mariadb', 'oracle', 'sql server', 'mssql', 'dynamodb',
  'cassandra', 'couchdb', 'neo4j', 'firebase firestore', 'supabase',
  'cockroachdb', 'influxdb', 'timescaledb', 'memcached', 'rabbitmq',
  'kafka', 'activemq', 'celery',
];

const CONCEPTS_AND_METHODOLOGIES = [
  'rest', 'restful', 'api', 'graphql', 'grpc', 'websocket', 'microservices',
  'monolith', 'serverless', 'event-driven', 'message queue', 'pub/sub',
  'ci/cd', 'devops', 'agile', 'scrum', 'kanban', 'waterfall', 'tdd',
  'bdd', 'unit testing', 'integration testing', 'e2e testing',
  'machine learning', 'deep learning', 'nlp', 'natural language processing',
  'computer vision', 'data science', 'data engineering', 'data analytics',
  'big data', 'etl', 'data pipeline', 'data warehouse', 'data lake',
  'oop', 'functional programming', 'design patterns', 'solid',
  'clean architecture', 'domain driven design', 'ddd',
  'oauth', 'jwt', 'authentication', 'authorization', 'encryption',
  'cybersecurity', 'penetration testing', 'soc', 'siem',
  'responsive design', 'accessibility', 'a11y', 'seo',
  'performance optimization', 'caching', 'load balancing',
  'distributed systems', 'cloud computing', 'containerization',
  'orchestration', 'infrastructure as code', 'iac',
  'blockchain', 'web3', 'smart contracts', 'defi',
];

const SOFT_SKILLS = [
  'leadership', 'communication', 'teamwork', 'collaboration',
  'problem solving', 'problem-solving', 'critical thinking',
  'time management', 'project management', 'mentoring',
  'adaptability', 'creativity', 'innovation', 'attention to detail',
  'analytical', 'strategic thinking', 'decision making',
  'presentation', 'negotiation', 'conflict resolution',
  'stakeholder management', 'cross-functional',
];

const ACTION_VERBS = [
  'achieved', 'administered', 'analyzed', 'architected', 'automated',
  'built', 'collaborated', 'configured', 'created', 'debugged',
  'delivered', 'deployed', 'designed', 'developed', 'documented',
  'engineered', 'enhanced', 'established', 'evaluated', 'executed',
  'implemented', 'improved', 'increased', 'integrated', 'launched',
  'led', 'maintained', 'managed', 'mentored', 'migrated',
  'monitored', 'optimized', 'orchestrated', 'organized', 'performed',
  'pioneered', 'planned', 'presented', 'programmed', 'proposed',
  'reduced', 'refactored', 'resolved', 'revamped', 'reviewed',
  'scaled', 'secured', 'simplified', 'spearheaded', 'streamlined',
  'supervised', 'tested', 'trained', 'transformed', 'troubleshot',
  'upgraded', 'utilized',
];

const CERTIFICATIONS = [
  'aws certified', 'azure certified', 'google cloud certified',
  'comptia', 'cissp', 'ceh', 'ccna', 'ccnp', 'ccie',
  'pmp', 'prince2', 'scrum master', 'csm', 'psm',
  'itil', 'togaf', 'six sigma',
  'tensorflow developer certificate', 'google data analytics',
  'meta frontend developer', 'ibm data science',
  'oracle certified', 'salesforce certified',
  'kubernetes certified', 'cka', 'ckad',
  'rhce', 'rhcsa', 'lpic',
];

const DEGREES = [
  'bachelor', 'bachelors', "bachelor's", 'b.s.', 'bs', 'b.sc', 'bsc',
  'b.tech', 'btech', 'b.e.', 'be', 'bca', 'bba',
  'master', 'masters', "master's", 'm.s.', 'ms', 'm.sc', 'msc',
  'm.tech', 'mtech', 'm.e.', 'me', 'mca', 'mba',
  'ph.d', 'phd', 'doctorate', 'diploma', 'associate',
  'computer science', 'information technology', 'software engineering',
  'electrical engineering', 'mechanical engineering', 'data science',
  'mathematics', 'statistics', 'physics', 'economics', 'business',
];

// Flatten all technical keywords into one set for quick lookup
const ALL_TECH_KEYWORDS = new Set([
  ...PROGRAMMING_LANGUAGES,
  ...FRAMEWORKS_AND_LIBRARIES,
  ...TOOLS_AND_PLATFORMS,
  ...DATABASES,
  ...CONCEPTS_AND_METHODOLOGIES,
]);

module.exports = {
  PROGRAMMING_LANGUAGES,
  FRAMEWORKS_AND_LIBRARIES,
  TOOLS_AND_PLATFORMS,
  DATABASES,
  CONCEPTS_AND_METHODOLOGIES,
  SOFT_SKILLS,
  ACTION_VERBS,
  CERTIFICATIONS,
  DEGREES,
  ALL_TECH_KEYWORDS,
};
