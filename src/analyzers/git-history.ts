import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Git history analyzer.
 *
 * Parses git log to compute:
 * - File hotspots (change frequency × complexity)
 * - AI vs human commit classification
 * - Churn metrics (lines added/removed per file)
 */

// Known AI agent signatures in commit messages and trailers
const AI_PATTERNS = [
  /Co-Authored-By:.*(?:Claude|Copilot|GPT|Gemini|Anthropic|OpenAI|noreply@anthropic\.com|github-actions)/i,
  /Generated (?:by|with|using) (?:Claude|Copilot|ChatGPT|Cursor|AI|Windsurf|Aider)/i,
  /\b(?:claude|copilot|cursor|windsurf|aider|codeium|tabnine|amazon-q)\b.*(?:generated|authored|created)/i,
  /🤖\s*Generated/i,
];

const BOT_EMAIL_PATTERNS = [
  /noreply@anthropic\.com/i,
  /\[bot\]@/i,
  /github-actions/i,
  /dependabot/i,
  /renovate/i,
];

export interface GitCommit {
  hash: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  isAI: boolean;
  files: Array<{ file: string; added: number; deleted: number }>;
}

export interface FileHotspot {
  file: string;
  changeCount: number;       // times this file was modified
  totalChurn: number;         // total lines added + deleted
  aiChangeCount: number;      // times changed in AI commits
  humanChangeCount: number;   // times changed in human commits
  lastChanged: string;        // date of last change
  hotspotScore: number;       // changeCount × log(totalChurn) — higher = hotter
}

export interface GitHistoryAnalysis {
  totalCommits: number;
  aiCommits: number;
  humanCommits: number;
  aiCommitRatio: number;      // 0-1
  hotspots: FileHotspot[];
  commits: GitCommit[];
  timeTakenMs: number;
}

export async function analyzeGitHistory(
  projectRoot: string,
  maxCommits = 500,
  srcFilter?: string,
): Promise<GitHistoryAnalysis> {
  const startTime = Date.now();

  const commits = await parseGitLog(projectRoot, maxCommits);
  if (commits.length === 0) {
    return {
      totalCommits: 0,
      aiCommits: 0,
      humanCommits: 0,
      aiCommitRatio: 0,
      hotspots: [],
      commits: [],
      timeTakenMs: Date.now() - startTime,
    };
  }

  // Classify commits
  for (const commit of commits) {
    commit.isAI = classifyCommit(commit);
  }

  const aiCommits = commits.filter(c => c.isAI).length;
  const humanCommits = commits.length - aiCommits;

  // Build hotspot data
  const hotspots = buildHotspots(commits, srcFilter);

  return {
    totalCommits: commits.length,
    aiCommits,
    humanCommits,
    aiCommitRatio: commits.length > 0 ? aiCommits / commits.length : 0,
    hotspots,
    commits,
    timeTakenMs: Date.now() - startTime,
  };
}

async function parseGitLog(projectRoot: string, maxCommits: number): Promise<GitCommit[]> {
  const SEPARATOR = '---GOODBOT-COMMIT---';
  const FIELD_SEP = '|FIELD|';

  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      `--max-count=${maxCommits}`,
      '--numstat',
      `--format=${SEPARATOR}%n%H${FIELD_SEP}%ae${FIELD_SEP}%ai${FIELD_SEP}%s${FIELD_SEP}%b`,
    ], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const commits: GitCommit[] = [];
    const rawCommits = stdout.split(SEPARATOR).filter(s => s.trim());

    for (const raw of rawCommits) {
      const lines = raw.trim().split('\n');
      if (lines.length === 0) continue;

      const headerLine = lines[0];
      const fields = headerLine.split(FIELD_SEP);
      if (fields.length < 4) continue;

      const [hash, authorEmail, date, subject, ...bodyParts] = fields;
      const body = bodyParts.join('');

      // Parse numstat lines (added\tdeleted\tfile)
      const files: GitCommit['files'] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (match) {
          const added = match[1] === '-' ? 0 : parseInt(match[1], 10);
          const deleted = match[2] === '-' ? 0 : parseInt(match[2], 10);
          files.push({ file: match[3], added, deleted });
        }
      }

      commits.push({
        hash: hash.trim(),
        authorEmail: authorEmail.trim(),
        date: date.trim(),
        subject: subject.trim(),
        body: body.trim(),
        isAI: false, // classified later
        files,
      });
    }

    return commits;
  } catch {
    // Not a git repo or git not available
    return [];
  }
}

/** Classify whether a commit was authored or co-authored by an AI agent */
export function classifyCommit(commit: GitCommit): boolean {
  const fullText = `${commit.subject}\n${commit.body}`;

  // Check commit message for AI patterns
  for (const pattern of AI_PATTERNS) {
    if (pattern.test(fullText)) return true;
  }

  // Check author email for bot patterns
  for (const pattern of BOT_EMAIL_PATTERNS) {
    if (pattern.test(commit.authorEmail)) return true;
  }

  return false;
}

function buildHotspots(commits: GitCommit[], srcFilter?: string): FileHotspot[] {
  const fileStats = new Map<string, {
    changeCount: number;
    totalChurn: number;
    aiChangeCount: number;
    humanChangeCount: number;
    lastChanged: string;
  }>();

  for (const commit of commits) {
    for (const file of commit.files) {
      // Filter to source files if specified
      if (srcFilter && !file.file.startsWith(srcFilter)) continue;
      // Skip non-source files
      if (!isSourceFile(file.file)) continue;

      const existing = fileStats.get(file.file) ?? {
        changeCount: 0,
        totalChurn: 0,
        aiChangeCount: 0,
        humanChangeCount: 0,
        lastChanged: commit.date,
      };

      existing.changeCount++;
      existing.totalChurn += file.added + file.deleted;
      if (commit.isAI) {
        existing.aiChangeCount++;
      } else {
        existing.humanChangeCount++;
      }
      // First commit encountered is most recent (git log is reverse chronological)
      if (!fileStats.has(file.file)) {
        existing.lastChanged = commit.date;
      }

      fileStats.set(file.file, existing);
    }
  }

  // Convert to hotspot array with scoring
  const hotspots: FileHotspot[] = [];
  for (const [file, stats] of fileStats) {
    const hotspotScore = stats.changeCount * Math.log2(Math.max(stats.totalChurn, 2));
    hotspots.push({
      file,
      changeCount: stats.changeCount,
      totalChurn: stats.totalChurn,
      aiChangeCount: stats.aiChangeCount,
      humanChangeCount: stats.humanChangeCount,
      lastChanged: stats.lastChanged,
      hotspotScore: Math.round(hotspotScore * 10) / 10,
    });
  }

  hotspots.sort((a, b) => b.hotspotScore - a.hotspotScore);
  return hotspots;
}

function isSourceFile(file: string): boolean {
  if (file.includes('node_modules/') || file.includes('dist/')) return false;
  if (file.endsWith('.lock') || file.endsWith('.json') || file.endsWith('.md')) return false;
  if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) return false;
  return /\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/.test(file);
}
