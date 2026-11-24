
import type { AttendanceRecord, Course, DB, DSCell, ExpertiseEvaluation, MeetingAttendance, QuestionSet, Sector, SectorSnapshot, SprintSubmission, SprintTask, Topic, Trainee, User, XpEvent } from "@/lib/mock/types";
import { QUESTION_BANK, NOTIFICATION_CATEGORIES } from "@/lib/mock/content";
import { addDays, addMonths, isWeekend, todayISO, weekStartOf } from "@/lib/utils";

export const SEED_VERSION = 14;

/* ------------------------------ course content ------------------------------ */

function sub(courseKey: string, ti: number, si: number, name: string, tech: string) {
  return {
    id: `${courseKey}-t${ti}-s${si}`,
    name,
    theory: `${name} is a core part of ${tech}. This lesson defines the idea, explains why it matters in day-to-day project work at BS23, and lists the rules you must remember before moving on.`,
    example: `Worked example: a user applies ${name.toLowerCase()} to a small feature in the training project, step by step, and checks the result in the browser or terminal.`,
    pseudocode: `function practise_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}(input):\n    validate(input)\n    result = apply(input)\n    return result`,
    resources: ["https://developer.mozilla.org/", "https://roadmap.sh/"],
  };
}

function topic(courseKey: string, ti: number, name: string, tech: string, subs: string[], prereq: number[] = []): Topic {
  return {
    id: `${courseKey}-t${ti}`,
    name,
    order: ti,
    prerequisites: prereq.map((p) => `${courseKey}-t${p}`),
    outcomes: [`Explain the key ideas of ${name}`, `Apply ${name} in a small task`, `Recognise common mistakes`],
    subtopics: subs.map((s, si) => sub(courseKey, ti, si + 1, s, tech)),
  };
}

function course(
  key: string,
  title: string,
  track: string,
  description: string,
  covers: string[],
  topics: [string, string[], number[]?][],
  source: Course["source"] = "ROADMAP_API",
): Course {
  return {
    id: key,
    title,
    track,
    description,
    source,
    covers,
    versions: [
      {
        id: `${key}-v1`,
        version: "1.0",
        status: "PUBLISHED",
        approvedBy: "pm1",
        approvedAt: addDays(todayISO(), -40),
        topics: topics.map(([n, s, p], i) => topic(key, i + 1, n, covers[0], s, p ?? (i > 0 ? [i] : []))),
      },
    ],
  };
}

const COURSES: Course[] = [
  course("c-js", "JavaScript Essentials", "Foundations", "Core JavaScript for every engineering role: values, functions, async and the DOM.", ["JavaScript"], [
    ["Values & types", ["Primitive types", "Objects & arrays", "Type coercion"]],
    ["Functions & scope", ["Closures", "this keyword", "Higher-order functions"]],
    ["Async JavaScript", ["Promises", "async / await", "Event loop"]],
  ]),
  course("c-react", "React Fundamentals", "Frontend", "Components, state, effects and data fetching with React.", ["React", "TypeScript"], [
    ["Components & JSX", ["JSX syntax", "Props", "Lists & keys"]],
    ["State & effects", ["useState", "useEffect", "Lifting state"]],
    ["Data fetching", ["Loading & error states", "Caching basics"]],
  ]),
  course("c-next", "Next.js App Router", "Frontend", "Routing, layouts, server and client components in Next.js.", ["Next.js", "React"], [
    ["Routing & layouts", ["Pages & layouts", "Dynamic routes"]],
    ["Server & client components", ["'use client' boundary", "Data fetching on the server"]],
  ]),
  course("c-nest", "NestJS API Development", "Backend", "Build REST APIs with modules, controllers, providers, validation and guards.", ["NestJS", "Node.js", "TypeScript"], [
    ["NestJS building blocks", ["Modules", "Controllers", "Providers"]],
    ["Validation & security", ["DTOs & pipes", "Guards & roles"]],
    ["Persistence with Prisma", ["Prisma schema", "Migrations"]],
  ]),
  course("c-sql", "SQL & PostgreSQL", "Backend", "Query, model and tune relational data in PostgreSQL.", ["SQL", "PostgreSQL"], [
    ["Querying data", ["SELECT & WHERE", "Joins", "Aggregation"]],
    ["Modelling", ["Keys & relations", "Normalisation"]],
    ["Performance", ["Indexes", "EXPLAIN"]],
  ]),
  course("c-git", "Git & Team Workflow", "Foundations", "Branching, pull requests and resolving conflicts in a team.", ["Git"], [
    ["Git basics", ["Commits", "Branches"]],
    ["Team workflow", ["Pull requests", "Merge conflicts", "Rebasing"]],
  ]),
  course("c-test", "Software Testing Basics", "QA", "Unit, integration and end-to-end testing with practical test design.", ["Testing"], [
    ["Test design", ["Test cases", "Boundary values"]],
    ["Automation", ["Unit tests", "E2E tests"]],
  ]),
  course("c-docker", "Docker & CI Essentials", "DevOps", "Containers, images, compose and a simple CI pipeline.", ["Docker"], [
    ["Containers", ["Images & containers", "Dockerfile"]],
    ["Delivery", ["Docker Compose", "CI pipeline basics"]],
  ]),
];

function questionSets(): QuestionSet[] {
  const sets: QuestionSet[] = [];
  for (const c of COURSES) {
    const v = c.versions[0];
    const bank = QUESTION_BANK.filter((b) => c.covers.includes(b.technology));
    const mcq = bank.map((b) => ({ id: `${c.id}-${b.id}`, text: b.text, type: "MCQ" as const, options: b.options, answerKey: b.answer }));
    const short = {
      id: `${c.id}-short`,
      text: `In your own words, explain one concept from ${c.title} and show a short code or pseudocode example.`,
      type: "SHORT" as const,
    };
    sets.push({
      id: `${c.id}-qs-t1`,
      courseId: c.id,
      topicId: v.topics[0].id,
      type: "FULL_TOPIC",
      title: `${v.topics[0].name} — topic assessment`,
      durationMin: 10,
      attemptLimit: 3,
      rubric: "Concept accuracy 50%, reasoning 30%, code correctness 20%",
      source: "APPROVED_POOL",
      contentVersion: v.version,
      rubricVersion: "1.0",
      approvedBy: "pm1",
      questions: [...mcq.slice(0, 3), short],
    });
    sets.push({
      id: `${c.id}-qs-final`,
      courseId: c.id,
      type: "COURSE_FINAL",
      title: `${c.title} — course final`,
      durationMin: 20,
      attemptLimit: 2,
      rubric: "Concept accuracy 50%, reasoning 30%, code correctness 20%",
      source: "APPROVED_POOL",
      contentVersion: v.version,
      rubricVersion: "1.0",
      approvedBy: "pm1",
      questions: [...mcq, short],
    });
  }
  return sets;
}

/* ------------------------------ people ------------------------------ */

function user(id: string, name: string, email: string, role: User["role"], extra: Partial<User> = {}): User {
  return {
    id,
    name,
    email,
    role,
    password: "Password123",
    mustChangePassword: false,
    emailVerified: true,
    createdAt: addDays(todayISO(), -60),
    ...extra,
  };
}

/* ------------------------------ sector growth history ------------------------------ */

/** Demo history: monthly average skill score per sector from January up to the current month. */
const SECTOR_HISTORY: Record<Sector, number[]> = {
  frontend: [52.0, 54.1, 56.0, 58.2, 61.0, 63.4, 65.1, 68.0, 70.2, 72.4, 74.9, 76.0],
  backend: [48.0, 49.5, 51.8, 53.0, 55.9, 57.2, 59.8, 62.0, 63.1, 65.5, 66.8, 68.0],
  fullstack: [45.0, 46.2, 49.0, 51.4, 53.1, 56.8, 59.0, 62.2, 64.0, 67.5, 70.1, 71.5],
  sqa: [50.0, 50.8, 52.1, 53.5, 54.2, 56.0, 57.1, 58.9, 60.2, 61.0, 62.5, 63.4],
};

function buildSectorSnapshots(today: string): SectorSnapshot[] {
  const year = today.slice(0, 4);
  const last = Number(today.slice(5, 7)); // current month (1-12)
  return (Object.keys(SECTOR_HISTORY) as Sector[]).flatMap((sector) =>
    SECTOR_HISTORY[sector].slice(0, last).map((avgScore, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, sector, avgScore })),
  );
}

/* ------------------------------ build seed ------------------------------ */

export function buildSeed(): DB {
  const today = todayISO();
  const users: User[] = [
    user("pm1", "Sarah Ahmed", "sarah@bs23.com", "PM"),
    user("pm2", "Rahim Uddin", "rahim@bs23.com", "PM"),
    user("u1", "Brishty Das", "brishty@bs23.com", "TRAINEE", { bio: "Aiming to become a strong full-stack engineer." }),
    user("u2", "Tanvir Hasan", "tanvir@bs23.com", "TRAINEE", { password: "Temp1234", mustChangePassword: true }),
    user("u3", "Nusrat Jahan", "nusrat@bs23.com", "TRAINEE"),
    user("u4", "Arif Rahman", "arif@bs23.com", "TRAINEE"),
    user("u5", "Sadia Islam", "sadia@bs23.com", "TRAINEE"),
    user("u6", "Fahim Chowdhury", "fahim@bs23.com", "TRAINEE", { password: "Temp1234", mustChangePassword: true }),
    user("u7", "Rafi Karim", "rafi@bs23.com", "TRAINEE"),
    user("u8", "Mahin Chowdhury", "mahin@bs23.com", "TRAINEE"),
    user("u9", "Nabila Rahman", "nabila@bs23.com", "TRAINEE"),
    user("u10", "Samir Hossain", "samir@bs23.com", "TRAINEE"),
    user("u11", "Tasnim Akter", "tasnim@bs23.com", "TRAINEE"),
  ];

  const trainees: Trainee[] = [
    { userId: "u1", traineeId: "BS23001", position: "FULLSTACK", attendanceMode: "PHYSICAL", resource: "TRAINEE", onboardDate: addDays(today, -24), periodEnd: addMonths(addDays(today, -24), 3), skills: ["React", "Node.js", "SQL"], teamIds: ["t-alpha"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u2", traineeId: "BS23002", position: "FRONTEND", attendanceMode: "ONLINE", resource: "SBU", onboardDate: addDays(today, -2), periodEnd: addMonths(addDays(today, -2), 3), skills: ["HTML & CSS", "JavaScript"], teamIds: ["t-alpha"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u3", traineeId: "BS23003", position: "BACKEND", attendanceMode: "PHYSICAL", resource: "TRAINEE", onboardDate: addDays(today, -24), periodEnd: addMonths(addDays(today, -24), 3), skills: ["NestJS", "PostgreSQL"], teamIds: ["t-alpha", "t-beta"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u4", traineeId: "BS23004", position: "QA", attendanceMode: "PHYSICAL", resource: "INDUSTRIAL_ATTACHMENT", onboardDate: addDays(today, -17), periodEnd: addMonths(addDays(today, -17), 3), skills: ["Testing", "JavaScript"], teamIds: ["t-beta"], pmId: "pm1", hideFromLeaderboard: true },
    { userId: "u5", traineeId: "BS23005", position: "BACKEND", attendanceMode: "ONLINE", resource: "CENTRAL_LND", onboardDate: addDays(today, -17), periodEnd: addMonths(addDays(today, -17), 3), skills: ["Docker", "Git"], teamIds: ["t-beta"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u6", traineeId: "BS23006", position: "FRONTEND", attendanceMode: "PHYSICAL", resource: "INDUSTRIAL_ATTACHMENT", onboardDate: addDays(today, 5), periodEnd: addMonths(addDays(today, 5), 3), skills: ["React"], teamIds: ["t-beta"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u7", traineeId: "BS23007", position: "BACKEND", attendanceMode: "PHYSICAL", resource: "CENTRAL_LND", onboardDate: addDays(today, -10), periodEnd: addMonths(addDays(today, -10), 3), skills: ["Node.js"], teamIds: ["t-gamma"], pmId: "pm2", hideFromLeaderboard: false },
    // Archived (inactive): trainee period already over
    { userId: "u8", traineeId: "BS23008", position: "FRONTEND", attendanceMode: "PHYSICAL", resource: "TRAINEE", onboardDate: addDays(today, -130), periodEnd: addMonths(addDays(today, -130), 3), archivedAt: addMonths(addDays(today, -130), 3), skills: ["JavaScript", "React", "Git"], teamIds: ["t-alpha"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u9", traineeId: "BS23009", position: "BACKEND", attendanceMode: "PHYSICAL", resource: "CENTRAL_LND", onboardDate: addDays(today, -200), periodEnd: addMonths(addDays(today, -200), 6), archivedAt: addMonths(addDays(today, -200), 6), skills: ["NestJS", "PostgreSQL", "SQL"], teamIds: ["t-beta"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u10", traineeId: "BS23010", position: "QA", attendanceMode: "PHYSICAL", resource: "INDUSTRIAL_ATTACHMENT", onboardDate: addDays(today, -95), periodEnd: addMonths(addDays(today, -95), 2), archivedAt: addMonths(addDays(today, -95), 2), skills: ["Testing", "JavaScript", "Git"], teamIds: ["t-alpha"], pmId: "pm1", hideFromLeaderboard: false },
    { userId: "u11", traineeId: "BS23011", position: "BACKEND", attendanceMode: "PHYSICAL", resource: "SBU", onboardDate: addDays(today, -150), periodEnd: addMonths(addDays(today, -150), 4), archivedAt: addMonths(addDays(today, -150), 4), skills: ["SQL", "Docker", "Git"], teamIds: ["t-beta"], pmId: "pm1", hideFromLeaderboard: false },
  ];

  /* evaluations for u1, u3, u4, u5 */
  const mkEval = (traineeUserId: string, role: string, techs: string[], correctMap: Record<string, number>, version = 1, daysAgo = 20): ExpertiseEvaluation => {
    const results = techs.map((t) => {
      const total = t === "Other" ? 0 : 3;
      const correct = Math.min(correctMap[t] ?? 0, total);
      const p = total ? correct / total : 0;
      const status = total === 0 ? "Not assessed" : p >= 0.8 ? "Strong" : p >= 0.6 ? "Developing" : "Needs revision";
      const priority = status === "Strong" ? "Low" : status === "Developing" ? "Medium" : "High";
      return { technology: t, correct, total, skipped: total ? 3 - correct > 0 ? 1 : 0 : 0, status, priority } as const;
    });
    const score = results.reduce((a, r) => a + r.correct, 0);
    const total = results.reduce((a, r) => a + r.total, 0);
    return {
      id: `ev-${traineeUserId}-${version}`,
      traineeUserId,
      version,
      joiningRole: role,
      technologies: techs,
      experience: "Intermediate",
      confidence: "Somewhat confident",
      improvements: ["Problem solving", "Testing"],
      goals: "Ship production-quality features and understand the full stack.",
      practicalAnswer: "I would build a form with validation, call a POST endpoint, validate again on the server and store the request in PostgreSQL.",
      level: score / Math.max(total, 1) >= 0.8 ? "Advanced" : score / Math.max(total, 1) >= 0.6 ? "Intermediate" : "Beginner",
      score,
      total,
      results: results.map((r) => ({ ...r })),
      answers: [],
      createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    };
  };

  const evaluations = [
    mkEval("u1", "Full Stack", ["JavaScript", "React", "Node.js", "SQL", "Git"], { JavaScript: 2, React: 2, "Node.js": 1, SQL: 1, Git: 3 }, 1, 22),
    mkEval("u1", "Full Stack", ["JavaScript", "React", "Node.js", "SQL", "Git"], { JavaScript: 3, React: 2, "Node.js": 2, SQL: 1, Git: 3 }, 2, 6),
    mkEval("u3", "Backend", ["NestJS", "PostgreSQL", "SQL", "Docker"], { NestJS: 2, PostgreSQL: 1, SQL: 2, Docker: 0 }),
    mkEval("u4", "QA", ["Testing", "JavaScript", "Other"], { Testing: 3, JavaScript: 1 }),
    mkEval("u5", "DevOps", ["Docker", "Git", "Node.js"], { Docker: 2, Git: 3, "Node.js": 1 }),
  ];

  /* assignments */
  const assignments = [
    { id: "as1", traineeUserId: "u1", courseId: "c-js", courseVersionId: "c-js-v1", assignedBy: "pm1", assignedAt: addDays(today, -20), dueDate: addDays(today, 5), source: "DIRECT" as const },
    { id: "as2", traineeUserId: "u1", courseId: "c-sql", courseVersionId: "c-sql-v1", assignedBy: "pm1", assignedAt: addDays(today, -15), dueDate: addDays(today, 14), source: "DIRECT" as const },
    { id: "as3", traineeUserId: "u1", courseId: "c-git", courseVersionId: "c-git-v1", assignedBy: "pm1", assignedAt: addDays(today, -21), source: "TEAM" as const },
    { id: "as4", traineeUserId: "u3", courseId: "c-nest", courseVersionId: "c-nest-v1", assignedBy: "pm1", assignedAt: addDays(today, -18), dueDate: addDays(today, 10), source: "DIRECT" as const },
    { id: "as5", traineeUserId: "u3", courseId: "c-git", courseVersionId: "c-git-v1", assignedBy: "pm1", assignedAt: addDays(today, -21), source: "TEAM" as const },
    { id: "as6", traineeUserId: "u4", courseId: "c-test", courseVersionId: "c-test-v1", assignedBy: "pm1", assignedAt: addDays(today, -14), source: "DIRECT" as const },
    { id: "as7", traineeUserId: "u5", courseId: "c-docker", courseVersionId: "c-docker-v1", assignedBy: "pm1", assignedAt: addDays(today, -14), source: "DIRECT" as const },
  ];

  /* progress for u1: JS course mostly done, git course complete */
  const js = COURSES[0].versions[0].topics;
  const git = COURSES[5].versions[0].topics;
  const sql = COURSES[4].versions[0].topics;
  const subtopicProgress = [
    ...js.flatMap((t, i) => (i < 2 ? t.subtopics : t.subtopics.slice(0, 1))),
    ...git.flatMap((t) => t.subtopics),
    ...sql[0].subtopics.slice(0, 2),
  ].map((s, i) => ({ traineeUserId: "u1", subtopicId: s.id, completedAt: addDays(today, -18 + (i % 15)) }));
  // a few for others
  COURSES[3].versions[0].topics[0].subtopics.forEach((s) => subtopicProgress.push({ traineeUserId: "u3", subtopicId: s.id, completedAt: addDays(today, -5) }));
  COURSES[6].versions[0].topics[0].subtopics.forEach((s) => subtopicProgress.push({ traineeUserId: "u4", subtopicId: s.id, completedAt: addDays(today, -4) }));

  const topicStates = [
    { traineeUserId: "u1", topicId: js[0].id, state: "MASTERED" as const },
    { traineeUserId: "u1", topicId: js[1].id, state: "SELF_DONE" as const },
    { traineeUserId: "u1", topicId: git[0].id, state: "MASTERED" as const },
    { traineeUserId: "u1", topicId: git[1].id, state: "MASTERED" as const },
    { traineeUserId: "u3", topicId: COURSES[3].versions[0].topics[0].id, state: "SELF_DONE" as const },
  ];

  const sets = questionSets();
  const attempts = [
    { id: "at1", traineeUserId: "u1", questionSetId: "c-js-qs-t1", attemptNo: 1, answers: {}, objectiveScore: 3, objectiveTotal: 3, finalScore: 88, status: "FINAL" as const, submitReason: "SUBMITTED" as const, integrityEvents: [], startedAt: addDays(today, -12) + "T10:00:00", submittedAt: addDays(today, -12) + "T10:08:00" },
    { id: "at2", traineeUserId: "u1", questionSetId: "c-git-qs-final", attemptNo: 1, answers: {}, objectiveScore: 3, objectiveTotal: 3, finalScore: 92, status: "FINAL" as const, submitReason: "SUBMITTED" as const, integrityEvents: [], startedAt: addDays(today, -8) + "T11:00:00", submittedAt: addDays(today, -8) + "T11:15:00" },
    { id: "at3", traineeUserId: "u1", questionSetId: "c-sql-qs-t1", attemptNo: 1, answers: {}, objectiveScore: 1, objectiveTotal: 3, status: "PROVISIONAL" as const, submitReason: "TAB_HIDDEN" as const, integrityEvents: [{ type: "TAB_HIDDEN" as const, at: addDays(today, -2) + "T15:04:00" }], startedAt: addDays(today, -2) + "T15:00:00", submittedAt: addDays(today, -2) + "T15:04:00" },
    { id: "at4", traineeUserId: "u3", questionSetId: "c-nest-qs-t1", attemptNo: 1, answers: {}, objectiveScore: 2, objectiveTotal: 3, status: "PROVISIONAL" as const, submitReason: "SUBMITTED" as const, integrityEvents: [], startedAt: addDays(today, -3) + "T12:00:00", submittedAt: addDays(today, -3) + "T12:09:00" },
  ];

  /* Archived trainees: a finished trainee period with the same kinds of records as active users. */
  const archivedCfg: Record<string, { role: string; techs: string[]; correct: Record<string, number>; courses: number[] }> = {
    u8: { role: "Frontend", techs: ["JavaScript", "React", "Git"], correct: { JavaScript: 3, React: 2, Git: 3 }, courses: [0, 1, 5] },
    u9: { role: "Backend", techs: ["NestJS", "PostgreSQL", "SQL"], correct: { NestJS: 3, PostgreSQL: 2, SQL: 3 }, courses: [3, 4, 5] },
    u10: { role: "QA", techs: ["Testing", "JavaScript", "Git"], correct: { Testing: 3, JavaScript: 2, Git: 2 }, courses: [6, 0] },
    u11: { role: "Backend", techs: ["SQL", "Docker", "Git"], correct: { SQL: 2, Docker: 3, Git: 3 }, courses: [4, 7, 5] },
  };
  const archived = trainees.filter((t) => t.archivedAt);
  const daysSince = (iso: string) => Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);
  archived.forEach((t, ti) => {
    const cfg = archivedCfg[t.userId];
    evaluations.push(mkEval(t.userId, cfg.role, cfg.techs, cfg.correct, 1, daysSince(t.onboardDate) - 2));
    if (ti % 2 === 0) evaluations.push(mkEval(t.userId, cfg.role, cfg.techs, Object.fromEntries(cfg.techs.map((x) => [x, 3])), 2, daysSince(t.periodEnd) + 5));
    cfg.courses.forEach((ci, k) => {
      const c = COURSES[ci];
      assignments.push({ id: `as-${t.userId}-${k}`, traineeUserId: t.userId, courseId: c.id, courseVersionId: `${c.id}-v1`, assignedBy: "pm1", assignedAt: addDays(t.onboardDate, 3 + k * 7), dueDate: addDays(t.onboardDate, 30 + k * 12), source: "DIRECT" as const });
      c.versions[0].topics.forEach((tp, i) => {
        topicStates.push({ traineeUserId: t.userId, topicId: tp.id, state: "MASTERED" as const });
        tp.subtopics.forEach((s, j) => subtopicProgress.push({ traineeUserId: t.userId, subtopicId: s.id, completedAt: addDays(t.onboardDate, 5 + ((k * 13 + i * 5 + j * 2) % 45)) }));
      });
      const d = addDays(t.onboardDate, 20 + k * 11);
      attempts.push({ id: `at-${t.userId}-${k}`, traineeUserId: t.userId, questionSetId: `${c.id}-qs-t1`, attemptNo: 1, answers: {}, objectiveScore: 3, objectiveTotal: 3, finalScore: 78 + ((ti * 7 + k * 5) % 18), status: "FINAL" as const, submitReason: "SUBMITTED" as const, integrityEvents: [], startedAt: d + "T10:00:00", submittedAt: d + "T10:09:00" });
    });
  });

  /* sprint tasks + submissions + attendance for last 15 calendar days */
  const sprintTasks: SprintTask[] = [];
  const sprintSubmissions: SprintSubmission[] = [];
  const attendance: AttendanceRecord[] = [];
  const meetingAttendance: MeetingAttendance[] = [];
  const active = trainees.filter((t) => t.pmId === "pm1" && !t.archivedAt && t.onboardDate <= today && t.userId !== "u2");
  const taskTitles = [
    ["Read lesson: Closures", "LND"],
    ["Fix login form validation", "SBO"],
    ["Practice SQL joins", "LND"],
    ["Write unit tests for utils", "SBO"],
    ["Review PR feedback", "SBO"],
    ["Complete Git rebasing lesson", "LND"],
  ] as const;
  for (let d = -14; d <= 0; d++) {
    const date = addDays(today, d);
    if (isWeekend(date)) continue;
    active.forEach((t, ti) => {
      if (date < t.onboardDate) return;
      if (d < 0) {
        const [a, b] = [taskTitles[(ti + d + 20) % 6], taskTitles[(ti + d + 21) % 6]];
        [a, b].forEach(([title, cat], k) =>
          sprintTasks.push({
            id: `st-${t.userId}-${date}-${k}`,
            traineeUserId: t.userId,
            title,
            description: "",
            category: cat,
            plannedHours: 3,
            plannedStart: k === 0 ? "10:00" : "14:00",
            plannedEnd: k === 0 ? "13:00" : "17:00",
            actualHours: k === 0 ? 3 : 2.5,
            blocker: d === -1 && t.userId === "u3" && k === 1 ? "Waiting for DB access on staging" : "",
            done: !(d === -1 && k === 1),
            date,
          }),
        );
        const onTime = (ti + d) % 4 !== 0;
        sprintSubmissions.push({ traineeUserId: t.userId, date, time: `${date}T${onTime ? "09:4" + (ti % 10) : "10:2" + (ti % 10)}:00`, onTime });
      }
      if (t.attendanceMode === "PHYSICAL" && d <= 0) {
        const late = (ti + d) % 5 === 0 ? 12 : 0;
        const missingExit = (d === -3 && ti === 0) || d === 0; // today: sign-in only, sign-out arrives after the day ends
        attendance.push({
          id: `ar-${t.userId}-${date}`,
          traineeUserId: t.userId,
          date,
          entry: late ? "09:12" : "08:55",
          exit: missingExit ? undefined : "18:05",
          lateMinutes: late,
          hours: missingExit ? undefined : late ? 8.9 : 9.2,
          source: "ERP",
          syncedAt: d === 0 ? new Date().toISOString() : addDays(today, -1) + "T23:00:00",
        });
      }
      if (d < 0) {
        const pending = d === -1;
        meetingAttendance.push({
          id: `ma-${t.userId}-${date}`,
          traineeUserId: t.userId,
          teamsIdentity: `${t.traineeId.toLowerCase()}@bs23.onmicrosoft.com`,
          meeting: "Daily Scrum",
          scheduledStart: `${date}T10:30:00`,
          firstJoin: pending ? undefined : `${date}T10:3${(ti + d + 20) % 4}:00`,
          intervals: pending ? [] : [{ join: "10:3" + ((ti + d + 20) % 4), leave: "10:50" }],
          durationMinutes: pending ? undefined : 20 - ((ti + d + 20) % 4),
          lateMinutes: pending ? undefined : (ti + d + 20) % 4,
          status: pending ? "REPORT_PENDING" : "ATTENDED",
        });
      }
    });
  }
  meetingAttendance.push({
    id: "ma-unmapped-1",
    teamsIdentity: "guest-7781@external.onmicrosoft.com",
    meeting: "Daily Scrum",
    scheduledStart: `${addDays(today, -2)}T10:30:00`,
    firstJoin: `${addDays(today, -2)}T10:31:00`,
    intervals: [{ join: "10:31", leave: "10:49" }],
    durationMinutes: 18,
    lateMinutes: 1,
    status: "UNMAPPED",
  });

  // Archived trainees: the last three weeks of their trainee period
  for (let d = -20; d <= -1; d++) {
    archived.forEach((t, ti) => {
      const date = addDays(t.periodEnd, d);
      if (isWeekend(date)) return;
      const [a, b] = [taskTitles[(ti + d + 40) % 6], taskTitles[(ti + d + 41) % 6]];
      [a, b].forEach(([title, cat], k) =>
        sprintTasks.push({ id: `st-${t.userId}-${date}-${k}`, traineeUserId: t.userId, title, description: "", category: cat, plannedHours: 3, plannedStart: k === 0 ? "10:00" : "14:00", plannedEnd: k === 0 ? "13:00" : "17:00", actualHours: k === 0 ? 3 : 2.5, blocker: "", done: true, date }),
      );
      const onTime = (ti + d + 40) % 5 !== 0;
      sprintSubmissions.push({ traineeUserId: t.userId, date, time: `${date}T${onTime ? "09:3" : "10:1"}${ti}:00`, onTime });
      if (t.attendanceMode === "PHYSICAL") {
        const late = (ti + d + 40) % 6 === 0 ? 10 : 0;
        attendance.push({ id: `ar-${t.userId}-${date}`, traineeUserId: t.userId, date, entry: late ? "09:10" : "08:52", exit: "18:02", lateMinutes: late, hours: late ? 8.9 : 9.2, source: "ERP", syncedAt: addDays(date, 1) + "T23:00:00" });
      }
      meetingAttendance.push({ id: `ma-${t.userId}-${date}`, traineeUserId: t.userId, teamsIdentity: `${t.traineeId.toLowerCase()}@bs23.onmicrosoft.com`, meeting: "Daily Scrum", scheduledStart: `${date}T10:30:00`, firstJoin: `${date}T10:3${(ti + d + 40) % 3}:00`, intervals: [{ join: "10:3" + ((ti + d + 40) % 3), leave: "10:50" }], durationMinutes: 19, lateMinutes: (ti + d + 40) % 3, status: "ATTENDED" });
    });
  }

  // today's tasks for u1 (not yet submitted)
  sprintTasks.push(
    { id: "st-u1-today-1", traineeUserId: "u1", title: "SQL: Aggregation lesson", description: "Finish GROUP BY exercises", category: "LND", plannedHours: 3, plannedStart: "10:00", plannedEnd: "13:00", actualHours: 0, blocker: "", done: false, date: today },
    { id: "st-u1-today-2", traineeUserId: "u1", title: "Build user card component", description: "", category: "SBO", plannedHours: 4, plannedStart: "14:00", plannedEnd: "18:00", actualHours: 0, blocker: "", done: false, date: today },
  );

  /* DS sheet: Team Alpha + Beta current week built from tasks */
  const ws = weekStartOf(today);
  const sprintWeeks = [
    { id: `sw-t-alpha-${addDays(ws, -7)}`, teamId: "t-alpha", weekStart: addDays(ws, -7) },
    { id: `sw-t-alpha-${ws}`, teamId: "t-alpha", weekStart: ws },
    { id: `sw-t-beta-${ws}`, teamId: "t-beta", weekStart: ws },
  ];
  const dsCells: DSCell[] = [];
  for (const w of sprintWeeks) {
    const members = trainees.filter((t) => t.teamIds.includes(w.teamId) && !t.archivedAt && t.onboardDate <= today);
    for (const m of members) {
      const at = w.weekStart + "T09:00:00";
      dsCells.push({ id: `${w.id}|${m.userId}|${w.weekStart}|PLAN`, weekId: w.id, traineeUserId: m.userId, date: w.weekStart, column: "PLAN", value: m.skills.map((s) => `Practice ${s}`).join("; "), authorId: "pm1", createdAt: at, updatedBy: "pm1", updatedAt: at, history: [] });
      for (let i = 0; i < 7; i++) {
        const date = addDays(w.weekStart, i);
        if (date >= today || isWeekend(date)) continue;
        const tasks = sprintTasks.filter((t) => t.traineeUserId === m.userId && t.date === date);
        if (!tasks.length) continue;
        const prev = sprintTasks.filter((t) => t.traineeUserId === m.userId && t.date === addDays(date, -1));
        const put = (column: DSCell["column"], value: string) =>
          value && dsCells.push({ id: `${w.id}|${m.userId}|${date}|${column}`, weekId: w.id, traineeUserId: m.userId, date, column, value, authorId: m.userId, createdAt: `${date}T09:45:00`, updatedBy: m.userId, updatedAt: `${date}T09:45:00`, history: [] });
        put("YESTERDAY", prev.map((t) => t.title).join("; "));
        put("HOURS", String(tasks.reduce((a, t) => a + t.actualHours, 0)));
        put("TODAY", tasks.map((t) => t.title).join("; "));
        put("BLOCKERS", tasks.map((t) => t.blocker).filter(Boolean).join("; "));
      }
    }
  }

  /* XP */
  const xpEvents: XpEvent[] = [];
  let xi = 0;
  const xp = (traineeUserId: string, source: string, amount: number, status: XpEvent["status"], date: string, evidence: string, flag?: string) =>
    xpEvents.push({ id: `xp${++xi}`, traineeUserId, source, amount, status, key: `${source}:${traineeUserId}:${date}:${xi}`, evidence, date, flag });
  for (const s of sprintSubmissions) if (s.onTime) xp(s.traineeUserId, "On-time sprint", 20, s.date >= addDays(today, -2) ? "PENDING" : "AWARDED", s.date, `Sprint submitted ${s.time.slice(11, 16)}`);
  xp("u1", "Verified module", 10, "AWARDED", addDays(today, -12), "Values & types — topic assessment 88%");
  xp("u1", "Final assessment", 40, "AWARDED", addDays(today, -8), "Git & Team Workflow final 92%");
  xp("u3", "Kudos", 5, "HELD", addDays(today, -2), "Kudos from Brishty Das", "Suspicious exchange");
  xp("u1", "Kudos", 5, "HELD", addDays(today, -2), "Kudos from Nusrat Jahan", "Suspicious exchange");

  archived.forEach((t) => {
    archivedCfg[t.userId].courses.forEach((ci, k) => {
      const c = COURSES[ci];
      xp(t.userId, "Verified module", 10, "AWARDED", addDays(t.onboardDate, 20 + k * 11), `${c.versions[0].topics[0].name} — topic assessment`);
    });
    xp(t.userId, "Final assessment", 40, "AWARDED", addDays(t.periodEnd, -10), `${COURSES[archivedCfg[t.userId].courses[0]].title} final`);
  });
  const archivedFeedback = archived.flatMap((t, ti) => [
    { id: `f-${t.userId}-1`, traineeUserId: t.userId, authorId: "pm1", text: "Good start. Keep the daily sprint notes specific and ask for help early when blocked.", version: 1, createdAt: addDays(t.onboardDate, 30) },
    { id: `f-${t.userId}-2`, traineeUserId: t.userId, authorId: "pm1", text: ["Finished the training period strongly: reliable on sprints and solid on assessments.", "Consistent delivery and clear communication. Ready to move to the project team.", "Good attention to detail in testing tasks. Keep building automation skills.", "Picked up the stack quickly. Next, work on estimating and breaking down tasks."][ti % 4], version: 2, createdAt: addDays(t.periodEnd, -3) },
  ]);

  /* notifications */
  const notifications = [
    { id: "n1", recipientId: "pm1", type: "Skill report submitted", title: "New skill report", message: "Brishty Das submitted a retest skill report (v2).", link: "/pm/trainees/u1", createdAt: new Date(Date.now() - 6 * 86400000).toISOString() },
    { id: "n2", recipientId: "pm1", type: "Suspicious kudos", title: "Suspicious kudos exchange", message: "Brishty Das and Nusrat Jahan sent each other kudos this week.", link: "/pm/gamification", createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    { id: "n3", recipientId: "pm1", type: "Sprint awaiting review", title: "Sprint blocker", message: "Nusrat Jahan reported a blocker: Waiting for DB access on staging.", link: "/pm/daily-sprints", createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: "n4", recipientId: "u1", type: "Course assigned", title: "Course assigned", message: "SQL & PostgreSQL was assigned to you.", link: "/trainee/roadmap", createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), readAt: new Date().toISOString() },
    { id: "n5", recipientId: "u1", type: "DS meeting scheduled", title: "DS meeting scheduled", message: "Team Alpha Daily Scrum tomorrow at 10:30.", link: "/trainee/daily-sprint", createdAt: new Date(Date.now() - 3600000).toISOString() },
  ];

  return {
    version: SEED_VERSION,
    users,
    trainees,
    teams: [
      { id: "t-alpha", name: "Team Alpha", pmId: "pm1" },
      { id: "t-beta", name: "Team Beta", pmId: "pm1" },
      { id: "t-gamma", name: "Team Gamma", pmId: "pm2" },
    ],
    sessions: [],
    evaluations,
    courses: COURSES,
    suggestionApprovals: [{ traineeUserId: "u1", courseId: "c-sql", approvedBy: "pm1", approvedAt: addDays(today, -16) }],
    assignments,
    courseRequests: [
      { id: "cr1", traineeUserId: "u1", courseId: "c-react", reason: "My team project uses React and I want to strengthen state management.", status: "PENDING", createdAt: addDays(today, -1) },
      { id: "cr2", traineeUserId: "u5", courseId: "c-git", reason: "Need better branching skills for CI work.", status: "PENDING", createdAt: addDays(today, -2) },
    ],
    topicStates,
    subtopicProgress,
    questionSets: sets,
    attempts,
    appeals: [],
    sprintTasks,
    sprintSubmissions,
    sprintWeeks,
    dsCells,
    taskOwners: [
      { id: "own-lnd-1", name: "Farhana Islam", kind: "LND", email: "farhana.islam@bs23.example" },
      { id: "own-lnd-2", name: "Tahmid Rahman", kind: "LND", email: "tahmid.rahman@bs23.example" },
      { id: "own-sbu-1", name: "Rafiq Ahmed", kind: "SBO", email: "rafiq.ahmed@bs23.example" },
      { id: "own-sbu-2", name: "Nadia Karim", kind: "SBO", email: "nadia.karim@bs23.example" },
      { id: "own-sbu-3", name: "Imran Hossain", kind: "SBO", email: "imran.hossain@bs23.example" },
    ],
    dsMeetings: [{ id: "m1", title: "Team Alpha Daily Scrum", teamId: "t-alpha", date: addDays(today, 1), time: "10:30", teamsLink: "https://teams.microsoft.com/l/meetup-join/demo", createdBy: "pm1" }],
    attendance,
    meetingAttendance,
    leaveRequests: [
      { id: "lr1", traineeUserId: "u3", start: addDays(today, 3), end: addDays(today, 4), type: "Personal", reason: "Family event", status: "PENDING", createdAt: addDays(today, -1) },
      { id: "lr2", traineeUserId: "u1", start: addDays(today, -9), end: addDays(today, -9), type: "Annual", reason: "Medical appointment", status: "APPROVED", review: "Approved. Take care.", reviewerId: "pm1", reviewedAt: addDays(today, -10), createdAt: addDays(today, -11) },
    ],
    reconciliations: [],
    feedback: [
      { id: "f1", traineeUserId: "u1", authorId: "pm1", text: "Strong ownership on sprint tasks. Focus next on SQL aggregation and query performance.", version: 1, createdAt: addDays(today, -7) },
      ...archivedFeedback,
    ],
    reports: [],
    emailDeliveries: [],
    xpEvents,
    xpRules: {
      verifiedModule: 10,
      verifiedModuleDailyCap: 30,
      onTimeSprint: 20,
      finalAssessment: 40,
      kudos: 5,
      kudosSendLimitPerWeek: 3,
      kudosCooldownDays: 7,
      kudosReceivedCapPerWeek: 15,
      streakMilestone: 25,
      pmReviewMultiplier: 1,
      engagementDropAlertPct: 30,
      sprintCutoff: "10:00",
    },
    levels: [
      { name: "Rookie", minXp: 0 },
      { name: "Builder", minXp: 250 },
      { name: "Pro", minXp: 750 },
      { name: "Expert", minXp: 1500 },
    ],
    quests: [
      { id: "q1", name: "Five on time", description: "Submit your daily sprint on time five days this week.", target: 5, reward: 30, start: ws, end: addDays(ws, 6) },
      { id: "q2", name: "Lesson streak", description: "Complete three lessons this week.", target: 3, reward: 20, start: ws, end: addDays(ws, 6) },
    ],
    questProgress: [
      { questId: "q1", traineeUserId: "u1", count: 2, verifiedBy: "pm1" },
      { questId: "q2", traineeUserId: "u1", count: 1 },
    ],
    badges: [
      { id: "b1", name: "Early Bird", icon: "🌅", kind: "BEHAVIORAL", criteria: "Submit the daily sprint on time 10 days in a row." },
      { id: "b2", name: "Streak Master", icon: "🔥", kind: "BEHAVIORAL", criteria: "Reach a 20-day sprint streak." },
      { id: "b3", name: "Bug Hunter", icon: "🐞", kind: "TECHNICAL", criteria: "Pass the testing assessment and a PM-reviewed bug-fix project." },
      { id: "b4", name: "Helpful Peer", icon: "🤝", kind: "BEHAVIORAL", criteria: "Receive 5 kudos from different peers." },
      { id: "b5", name: "Mentor's Pick", icon: "⭐", kind: "SPECIAL", criteria: "Chosen by the PM for outstanding work." },
    ],
    badgeAwards: [{ badgeId: "b1", traineeUserId: "u1", evidence: "10 on-time sprints", awardedBy: "pm1", awardedAt: addDays(today, -3) }],
    kudos: [
      { id: "k1", fromId: "u1", toId: "u3", category: "Helpful", message: "Thanks for helping me with SQL joins!", date: addDays(today, -2), suspicious: true },
      { id: "k2", fromId: "u3", toId: "u1", category: "Teamwork", message: "Great pairing session.", date: addDays(today, -2), suspicious: true },
    ],
    streakFreezes: [{ traineeUserId: "u1", date: addDays(today, -9), source: "LEAVE", reason: "Approved leave" }],
    notifications,
    notificationPrefs: users.flatMap((u) => NOTIFICATION_CATEGORIES.map((c) => ({ userId: u.id, category: c, showInBell: true }))),
    integrations: [
      { key: "ERP", name: "Company ERP", status: "Stale cached data", lastSync: addDays(today, -1) + "T23:00:00" },
      { key: "TEAMS", name: "Microsoft Teams", status: "Authorization required" },
      { key: "YOUTUBE", name: "YouTube Data API", status: "Disconnected" },
      { key: "AI", name: "AI evaluation service", status: "Disconnected" },
      { key: "ROADMAP", name: "Roadmap API", status: "Disconnected" },
      { key: "EMAIL", name: "Email provider", status: "Disconnected" },
    ],
    retakeRequests: [],
    sectorSnapshots: buildSectorSnapshots(today),
    currentUserId: null,
    currentSessionId: null,
  };
}
