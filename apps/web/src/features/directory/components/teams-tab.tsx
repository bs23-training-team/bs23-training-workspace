import { Card, EmptyState } from "@/components/ui/ui";
import { POSITION_LABEL } from "@/lib/utils";
import type { ApiTeam } from "../api";

/** The PM's teams and their current members, as the API returns them. */
export function TeamsTab({ teams, error }: { teams: ApiTeam[] | null; error: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!teams) return <p className="text-sm text-muted">Loading teams…</p>;
  if (!teams.length) return <EmptyState title="You have no teams yet. Use Create team." />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {teams.map((team) => (
        <Card key={team.id} title={team.name} description={`PM: ${team.pmName} · ${team.memberCount} user(s)`}>
          {team.members.length === 0 ? (
            <p className="text-sm text-muted">No users yet. Add them from the Users tab.</p>
          ) : (
            <ul className="space-y-2">
              {team.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between text-sm">
                  <span>
                    {member.name} <span className="text-muted">({member.userId})</span>
                  </span>
                  <span className="text-xs text-muted">{POSITION_LABEL[member.position]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
