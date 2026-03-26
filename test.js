/**
 * Test suite for ATS Resume Analyzer scoring engine.
 * Tests multiple JD + resume combinations to validate scoring accuracy.
 */

const { calculateATSScore } = require('./lib/scorer');
const { generateInsights } = require('./lib/insights');

// ─── Test Cases ─────────────────────────────────────────────

const tests = [
  {
    name: 'Strong Match — React Developer',
    jd: `We are looking for a Frontend Developer with strong experience in React, JavaScript, TypeScript, Redux, and CSS. 
You should have experience with REST APIs, Git, and Agile methodologies. 
Experience with Node.js and PostgreSQL is a plus. 3+ years experience required.`,
    resume: `SKILLS
JavaScript, TypeScript, React, Redux, CSS, HTML, Node.js, Git, REST APIs

EXPERIENCE
Senior Frontend Developer at TechCorp (2021-2024)
- Developed and maintained React applications serving 50K+ users
- Implemented Redux state management for complex data flows
- Built responsive UIs with CSS and styled-components
- Collaborated with backend team using REST APIs
- Led Agile sprint planning and code reviews

PROJECTS
- E-commerce Dashboard: React + Redux + TypeScript application with real-time data
- Component Library: Reusable UI components built with React and CSS

EDUCATION
Bachelor of Science in Computer Science, MIT (2018-2021)`,
    expect: { minScore: 6, maxScore: 10 },
  },
  {
    name: 'Partial Match — Python Dev applying for React',
    jd: `Looking for a React developer with TypeScript, Redux, CSS, and REST API experience. 
Must know Git and Agile. AWS experience preferred.`,
    resume: `SKILLS
Python, Django, Flask, PostgreSQL, Docker, Git

EXPERIENCE
Backend Developer at DataCo (2020-2024)
- Built REST APIs using Django and Flask
- Deployed services on AWS EC2
- Used Git for version control and collaborated in Agile sprints

PROJECTS
- ML Pipeline: Python-based data processing pipeline
- API Gateway: Django REST framework API

EDUCATION
B.Tech in Computer Science`,
    expect: { minScore: 2, maxScore: 5 },
  },
  {
    name: 'No Match — Chef applying for Developer',
    jd: `Looking for Full Stack Developer with React, Node.js, MongoDB, Docker, and AWS experience.`,
    resume: `EXPERIENCE
Head Chef at Restaurant XYZ (2018-2024)
- Managed kitchen staff of 15 people
- Created seasonal menus and recipes
- Maintained food safety standards

EDUCATION
Culinary Arts Diploma`,
    expect: { minScore: 0, maxScore: 3 },
  },
  {
    name: 'Plain Text Resume — No Section Headers',
    jd: `Data Analyst role requiring Python, SQL, Excel, Tableau, and data visualization skills. 
Statistics and machine learning knowledge preferred.`,
    resume: `John Doe | john@email.com | +1-555-123-4567 | linkedin.com/in/johndoe

I have 3 years of experience as a data analyst working with Python, SQL, and Excel.
I have built dashboards using Tableau and performed statistical analysis.
I am proficient in data visualization and have used machine learning models.
Previously worked at DataCorp where I analyzed customer behavior data.
B.S. in Statistics from State University.`,
    expect: { minScore: 4, maxScore: 8 },
  },
  {
    name: 'Very Short JD and Resume',
    jd: `Need a Python developer with Django experience.`,
    resume: `Python developer. 5 years Django. Built web apps.`,
    expect: { minScore: 2, maxScore: 8 },
  },
];

// ─── Run Tests ──────────────────────────────────────────────

console.log('═══════════════════════════════════════');
console.log('   ATS RESUME ANALYZER — TEST SUITE');
console.log('═══════════════════════════════════════\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = calculateATSScore(test.jd, test.resume);
  const insights = generateInsights(result);
  const score = result.finalScore;
  const inRange = score >= test.expect.minScore && score <= test.expect.maxScore;

  const status = inRange ? '✅ PASS' : '❌ FAIL';
  if (inRange) passed++; else failed++;

  console.log(`${status} | ${test.name}`);
  console.log(`  Score: ${score}/10 (expected ${test.expect.minScore}-${test.expect.maxScore})`);
  console.log(`  Keywords:   ${result.breakdown.keywords.score}% (${result.breakdown.keywords.matched.length} matched, ${result.breakdown.keywords.missing.length} missing)`);
  console.log(`  Experience: ${result.breakdown.experience.score}%`);
  console.log(`  Projects:   ${result.breakdown.projects.score}%`);
  console.log(`  Education:  ${result.breakdown.education.score}%`);
  console.log(`  Format:     ${result.breakdown.format.score}%`);
  console.log(`  ATS Pass:   ${insights.atsPassProbability}`);
  console.log(`  Matched:    ${result.breakdown.keywords.matched.slice(0, 8).join(', ')}`);
  console.log(`  Missing:    ${result.breakdown.keywords.missing.slice(0, 8).join(', ')}`);
  console.log('');
}

console.log('═══════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed out of ${tests.length}`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
