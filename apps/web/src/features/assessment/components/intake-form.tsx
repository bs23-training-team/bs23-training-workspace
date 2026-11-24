"use client";
import type { IntakeAnswers, IntakeSkillAnswer } from "@/lib/mock/types";
import { INTAKE_ABILITY, INTAKE_DESCRIPTION_MAX, INTAKE_DURATION, INTAKE_LAST_USED, INTAKE_LEVELS, INTAKE_NO_PROJECTS, INTAKE_PROJECT_KINDS, INTAKE_WORK_TYPES, JOINING_ROLES, TECHNOLOGIES } from "@/lib/mock/content";
import { Card, Checkbox, ChoiceGroup, Field, Select, Textarea } from "@/components/ui/ui";

const MAX_ROLES = 3;
const ROLES = JOINING_ROLES;

/** Step 1 of the skill assessment: ten questions. Questions 5–7 repeat for every skill chosen in question 4. */
export function IntakeForm({ value: v, onChange }: { value: IntakeAnswers; onChange: (v: IntakeAnswers) => void }) {
  const set = (patch: Partial<IntakeAnswers>) => onChange({ ...v, ...patch });
  const noProjects = v.projectKind === INTAKE_NO_PROJECTS;
  const skillAnswer = (s: string): IntakeSkillAnswer => v.perSkill[s] ?? { ability: "", duration: "", lastUsed: "" };
  const setSkill = (s: string, patch: Partial<IntakeSkillAnswer>) => set({ perSkill: { ...v.perSkill, [s]: { ...skillAnswer(s), ...patch } } });
  const lessOptions = v.noSkills ? [] : v.skills;

  return (
    <div className="space-y-6">
      <Field label="1. What is your current level of learning or work experience?" required>
        <ChoiceGroup name="Experience level" options={INTAKE_LEVELS} value={v.level ? [v.level] : []} onChange={(x) => set({ level: x[0] })} />
      </Field>

      <Field label="2. What types of work interest you?" required hint="Select all that apply.">
        <ChoiceGroup name="Types of work" multiple options={INTAKE_WORK_TYPES} value={v.workTypes} onChange={(x) => set({ workTypes: x })} />
      </Field>

      <Field label="3. Which roles interest you?" required hint={`Select up to ${MAX_ROLES} roles, or Not sure yet.`}>
        <div className="space-y-2">
          <ChoiceGroup
            name="Roles"
            multiple
            options={ROLES}
            value={v.rolesNotSure ? [] : v.roles}
            onChange={(x) => set({ roles: x.length > MAX_ROLES ? v.roles : x, rolesNotSure: false })}
          />
          <Checkbox label="Not sure yet" checked={v.rolesNotSure} onChange={(on) => set({ rolesNotSure: on, roles: on ? [] : v.roles })} />
        </div>
      </Field>

      <Field label="4. Which skills have you learned or used before?" required hint="Select all that apply.">
        <div className="space-y-2">
          <ChoiceGroup
            name="Skills"
            multiple
            options={TECHNOLOGIES}
            value={v.noSkills ? [] : v.skills}
            onChange={(x) => set({ skills: x, noSkills: false, perSkill: Object.fromEntries(Object.entries(v.perSkill).filter(([k]) => x.includes(k))), lessConfident: v.lessConfident.filter((k) => x.includes(k)) })}
          />
          <Checkbox label="I have not learned any of these yet" checked={v.noSkills} onChange={(on) => set({ noSkills: on, skills: on ? [] : v.skills, perSkill: on ? {} : v.perSkill, lessConfident: on ? [] : v.lessConfident })} />
        </div>
      </Field>

      {!v.noSkills && v.skills.length > 0 && (
        <Card title="5–7. About each skill you selected" description="Answer all three questions for every skill.">
          <div className="space-y-5">
            {v.skills.map((s) => {
              const a = skillAnswer(s);
              return (
                <fieldset key={s} className="rounded-lg border border-line p-4">
                  <legend className="px-1 text-sm font-semibold">{s}</legend>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="5. How would you describe your ability?" htmlFor={`ab-${s}`} required>
                      <Select id={`ab-${s}`} value={a.ability} onChange={(e) => setSkill(s, { ability: e.target.value })}>
                        <option value="">Select…</option>
                        {INTAKE_ABILITY.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="6. How long have you been learning or using it?" htmlFor={`du-${s}`} required>
                      <Select id={`du-${s}`} value={a.duration} onChange={(e) => setSkill(s, { duration: e.target.value })}>
                        <option value="">Select…</option>
                        {INTAKE_DURATION.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="7. When did you last use it?" htmlFor={`lu-${s}`} required>
                      <Select id={`lu-${s}`} value={a.lastUsed} onChange={(e) => setSkill(s, { lastUsed: e.target.value })}>
                        <option value="">Select…</option>
                        {INTAKE_LAST_USED.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Card>
      )}

      <Field label="8. What projects or practical work have you completed?" required>
        <div className="space-y-3">
          <ChoiceGroup
            name="Projects"
            options={INTAKE_PROJECT_KINDS}
            value={v.projectKind ? [v.projectKind] : []}
            onChange={(x) => set({ projectKind: x[0], contributionNA: x[0] === INTAKE_NO_PROJECTS, ...(x[0] === INTAKE_NO_PROJECTS ? { projectDescription: "", contribution: "", contributionSkills: [] } : {}) })}
          />
          {v.projectKind && !noProjects && (
            <Field label="Briefly describe your experience" htmlFor="pd" required hint={`${v.projectDescription.length}/${INTAKE_DESCRIPTION_MAX}`}>
              <Textarea id="pd" maxLength={INTAKE_DESCRIPTION_MAX} value={v.projectDescription} onChange={(e) => set({ projectDescription: e.target.value })} />
            </Field>
          )}
        </div>
      </Field>

      <Field label="9. What was your personal contribution to those projects, and which skills did you use?" required={!!v.projectKind && !noProjects}>
        {noProjects || v.contributionNA ? (
          <p className="text-sm text-muted">Not applicable — you have not worked on a project yet.</p>
        ) : (
          <div className="space-y-3">
            <Textarea aria-label="Personal contribution" maxLength={INTAKE_DESCRIPTION_MAX} value={v.contribution} onChange={(e) => set({ contribution: e.target.value })} placeholder="Describe what you personally did." />
            <p className="text-xs text-muted">{v.contribution.length}/{INTAKE_DESCRIPTION_MAX}</p>
            <ChoiceGroup name="Skills used in projects" multiple options={TECHNOLOGIES} value={v.contributionSkills} onChange={(x) => set({ contributionSkills: x })} />
            {!v.projectKind && <p className="text-xs text-muted">Answer question 8 first, or choose below if this does not apply.</p>}
            <Checkbox label="Not applicable — I have not worked on a project yet" checked={v.contributionNA} onChange={(on) => set({ contributionNA: on })} />
          </div>
        )}
      </Field>

      <Field label="10. Which skills or topics do you feel less confident about?" required={!v.noSkills} hint="Select from your chosen skills and optionally describe specific topics, or choose Not sure yet.">
        <div className="space-y-3">
          {lessOptions.length > 0 && (
            <ChoiceGroup name="Less confident skills" multiple options={lessOptions} value={v.lessConfidentNotSure ? [] : v.lessConfident} onChange={(x) => set({ lessConfident: x, lessConfidentNotSure: false })} />
          )}
          <Checkbox label="Not sure yet" checked={v.lessConfidentNotSure || v.noSkills} disabled={v.noSkills} onChange={(on) => set({ lessConfidentNotSure: on, lessConfident: on ? [] : v.lessConfident })} />
          <Textarea aria-label="Specific topics (optional)" maxLength={INTAKE_DESCRIPTION_MAX} value={v.lessConfidentNotes} onChange={(e) => set({ lessConfidentNotes: e.target.value })} placeholder="Optional: describe specific topics." />
        </div>
      </Field>
    </div>
  );
}
