import { useAuth } from '../../lib/auth';
import { Card, Button, SectionLabel } from '../../components/primitives';

export function SettingsPage({ role }: { role: 'player' | 'coach' }) {
  const { profile, team, logOut } = useAuth();
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-6">Settings</h1>
      <Card className="p-5 mb-4">
        <SectionLabel>Account</SectionLabel>
        <p className="text-sm"><span className="text-[var(--color-ink-muted)]">Name:</span> {profile?.name}</p>
        <p className="text-sm mt-1"><span className="text-[var(--color-ink-muted)]">Role:</span> {role === 'coach' ? 'Coach / Captain' : 'Player'}</p>
      </Card>
      {team && (
        <Card className="p-5 mb-4">
          <SectionLabel>Team</SectionLabel>
          <p className="text-sm">{team.name} ({team.shortName})</p>
        </Card>
      )}
      <Card className="p-5">
        <SectionLabel>Account actions</SectionLabel>
        <Button variant="secondary" onClick={async () => { await logOut(); }}>Log out</Button>
      </Card>
    </div>
  );
}
