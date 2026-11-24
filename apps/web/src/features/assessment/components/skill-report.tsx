"use client";
import type { DB, ExpertiseEvaluation } from "@/lib/mock/types";
import { PROCTOR_RULE_LABEL, QUESTION_BANK, SKILL_QUIZ_MAX_VIOLATIONS } from "@/lib/mock/content";
import { skillAnalysis } from "../api";
import { formatClock } from "./skill-quiz";
import { Alert, Badge, Card, KeyValue, StatusBadge, Table, Td } from "@/components/ui/ui";
import { formatDateTime } from "@/lib/utils";

/** Skill analysis report (FR-SKL-05/06). Used by the trainee and in the PM's trainee profile. */
export function SkillReport({ db, ev }: { db: DB; ev: ExpertiseEvaluation }) {
  // Results, gaps and suggestions come from the skill-analysis service; the UI only displays them.
  const { strong, gaps, required, missing, recommended } = skillAnalysis(db, ev);

  return (
    <div className="space-y-5">
      <Card title={`Skill analysis v${ev.version}`} description={`Submitted ${formatDateTime(ev.createdAt)}`}>
        <KeyValue
          items={[
            ["Joining role", ev.joiningRole],
            ["Stack", ev.technologies.join(", ")],
            ["Assessed level", ev.level],
            ["Score", `${ev.score} / ${ev.total} correct`],
            ["Self-reported experience", ev.experience],
            ["Self-reported confidence", `${ev.confidence} (never awards marks)`],
          ]}
        />
      </Card>

      {ev.intake && (
        <Card title="Intake answers" description="Self-reported, from the 10-question intake.">
          <KeyValue
            items={[
              ["Experience level", ev.intake.level],
              ["Types of work", ev.intake.workTypes.join(", ")],
              ["Roles of interest", ev.intake.rolesNotSure ? "Not sure yet" : ev.intake.roles.join(", ")],
              ["Skills", ev.intake.noSkills ? "None yet" : ev.intake.skills.join(", ")],
              ["Projects", ev.intake.projectKind + (ev.intake.projectDescription ? ` — ${ev.intake.projectDescription}` : "")],
              ["Contribution", ev.intake.contributionNA ? "Not applicable" : `${ev.intake.contribution} (skills: ${ev.intake.contributionSkills.join(", ")})`],
              ["Less confident about", (ev.intake.lessConfidentNotSure || ev.intake.noSkills ? "Not sure yet" : ev.intake.lessConfident.join(", ")) + (ev.intake.lessConfidentNotes ? ` — ${ev.intake.lessConfidentNotes}` : "")],
            ]}
          />
          {ev.intake.skills.length > 0 && !ev.intake.noSkills && (
            <div className="mt-4">
              <Table head={["Skill", "Ability", "Time using it", "Last used"]}>
                {ev.intake.skills.map((s) => (
                  <tr key={s}>
                    <Td className="font-medium">{s}</Td>
                    <Td>{ev.intake?.perSkill[s]?.ability}</Td>
                    <Td>{ev.intake?.perSkill[s]?.duration}</Td>
                    <Td>{ev.intake?.perSkill[s]?.lastUsed}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>
      )}

      {ev.proctoring && (
        <Card title="Assessment summary" description="No negative marking. The practical question is not scored.">
          <KeyValue
            items={[
              ["Total marks", ev.proctoring.totalMarks != null ? `${ev.proctoring.marksObtained ?? 0} / ${ev.proctoring.totalMarks}` : `${ev.score} / ${ev.total}`],
              ["Percentage", ev.total ? `${Math.round((ev.score / ev.total) * 100)}%` : "—"],
              ["Level", ev.level],
              ["Time used", `${formatClock(ev.proctoring.timeTakenSec)} of ${formatClock(ev.proctoring.durationMin * 60)}`],
              ["Ended by", ev.proctoring.endReason === "SUBMITTED" ? "User submitted" : ev.proctoring.endReason === "TIME_UP" ? "Time ran out (auto-submitted)" : `Rule breaches (auto-submitted at warning ${SKILL_QUIZ_MAX_VIOLATIONS})`],
              ["Rule breaches", String(ev.proctoring.violations.length)],
            ]}
          />
        </Card>
      )}

      {ev.answers.length > 0 && (
        <Card title="Marks per question" description="Shows whether each answer was right. The correct answers are not shown.">
          <Table head={["No.", "Skill", "Question", "Result", "Marks"]}>
            {ev.answers.map((a, i) => {
              const q = QUESTION_BANK.find((x) => x.id === a.questionId);
              const label = a.skipped ? "Not answered" : a.correct ? "Correct" : "Incorrect";
              return (
                <tr key={a.questionId}>
                  <Td>{i + 1}</Td>
                  <Td className="font-medium">{a.technology}</Td>
                  <Td className="max-w-md">{q?.text ?? "—"}</Td>
                  <Td>
                    <Badge tone={a.skipped ? "gray" : a.correct ? "green" : "red"}>{label}</Badge>
                  </Td>
                  <Td>{a.correct ? (ev.proctoring?.marksPerQuestion ?? 1).toFixed(2) : "0.00"} / {(ev.proctoring?.marksPerQuestion ?? 1).toFixed(2)}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {ev.proctoring && (
        <Card title="Proctoring" description="Rules: stay on the quiz tab, no copy, paste or right-click, no reload.">
          {ev.proctoring.violations.length === 0 ? (
            <Alert tone="green">No rule breaches were recorded.</Alert>
          ) : (
            <Table head={["Time", "Rule not followed"]}>
              {ev.proctoring.violations.map((v, i) => (
                <tr key={i}>
                  <Td>{formatDateTime(v.at)}</Td>
                  <Td>{PROCTOR_RULE_LABEL[v.rule]}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Card title="Technology results" description="Status and priority per technology, as returned by the skill-analysis service.">
        <Table head={["Technology", "Correct", "Skipped", "Status", "Priority"]}>
          {ev.results.map((r) => (
            <tr key={r.technology}>
              <Td className="font-medium">{r.technology}</Td>
              <Td>{r.total ? `${r.correct} / ${r.total}` : "—"}</Td>
              <Td>{r.skipped}</Td>
              <Td>
                <StatusBadge status={r.status} />
              </Td>
              <Td>
                <StatusBadge status={r.priority} />
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Existing knowledge">
          {strong.length ? (
            <div className="flex flex-wrap gap-2">
              {strong.map((s) => (
                <Badge key={s} tone="green">
                  {s}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No technology reached Strong yet.</p>
          )}
        </Card>
        <Card title={`Required skills for ${ev.joiningRole}`}>
          <div className="flex flex-wrap gap-2">
            {required.map((s) => (
              <Badge key={s} tone={strong.includes(s) ? "green" : "gray"}>
                {s}
              </Badge>
            ))}
          </div>
        </Card>
        <Card title="Knowledge gaps">
          {gaps.length || missing.length ? (
            <ul className="space-y-1 text-sm">
              {gaps.map((g) => (
                <li key={g.technology}>
                  <span className="font-medium">{g.technology}</span> — {g.status}, {g.priority} priority
                </li>
              ))}
              {missing.map((m) => (
                <li key={m} className="text-muted">
                  {m} — not in your stack yet
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No gaps found in the assessed technologies.</p>
          )}
        </Card>
        <Card title="Recommended courses" description="Suggestions only. Your PM reviews and assigns courses.">
          {recommended.length ? (
            <ul className="space-y-2 text-sm">
              {recommended.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>{c.title}</span>
                  <Badge tone="blue">{c.track}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No recommendations.</p>
          )}
        </Card>
      </div>

      <Card title="Practical answer" action={<Badge tone="amber">Pending AI review</Badge>}>
        <p className="whitespace-pre-wrap text-sm text-ink">{ev.practicalAnswer || "—"}</p>
      </Card>
      <Alert tone="blue">Self-reported confidence never awards marks. Recommendations never assign courses — nothing reaches your roadmap until your PM assigns it.</Alert>
    </div>
  );
}
