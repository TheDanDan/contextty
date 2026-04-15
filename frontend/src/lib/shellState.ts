export class ShellState {
  cwd: string;
  env: Record<string, string>;
  exit_code: number;
  username: string;
  hostname: string;
  aliases: Record<string, string>;
  jobs: string[];
  interactive_mode: boolean;
  interactive_program: string;

  constructor(overrides?: Partial<ShellState>) {
    this.cwd = '/home/user';
    this.env = {};
    this.exit_code = 0;
    this.username = 'user';
    this.hostname = 'contextty';
    this.aliases = { ll: 'ls -alF', la: 'ls -A', l: 'ls -CF' };
    this.jobs = [];
    this.interactive_mode = false;
    this.interactive_program = '';
    if (overrides) Object.assign(this, overrides);
  }

  toHeader(): string {
    const parts: string[] = [`cwd=${this.cwd}`, `exit_code=${this.exit_code}`];
    if (Object.keys(this.env).length > 0) {
      parts.push(`env=${JSON.stringify(this.env)}`);
    }
    if (Object.keys(this.aliases).length > 0) {
      parts.push(`aliases=${JSON.stringify(this.aliases)}`);
    }
    if (this.jobs.length > 0) {
      parts.push(`jobs=${JSON.stringify(this.jobs)}`);
    }
    return `[SHELL STATE ${parts.join(' ')}]`;
  }

  static fromJson(data: string | Record<string, unknown>, base: ShellState): ShellState {
    const parsed: Record<string, unknown> = typeof data === 'string' ? JSON.parse(data) : data;
    return new ShellState({
      cwd: (parsed.cwd as string) ?? base.cwd,
      env: (parsed.env as Record<string, string>) ?? base.env,
      exit_code: (parsed.exit_code as number) ?? base.exit_code,
      username: base.username,
      hostname: base.hostname,
      aliases: (parsed.aliases as Record<string, string>) ?? base.aliases,
      jobs: (parsed.jobs as string[]) ?? base.jobs,
      interactive_mode: base.interactive_mode,
      interactive_program: base.interactive_program,
    });
  }

  ps1(): string {
    const home = `/home/${this.username}`;
    const displayCwd = this.cwd.startsWith(home) ? '~' + this.cwd.slice(home.length) : this.cwd;
    return `${this.username}@${this.hostname}:${displayCwd}$ `;
  }
}
