/**
 * GitHub Repository Intelligence Service (Production-hardened)
 *
 * Features:
 * - Uses defaultBranch from repo metadata (no hardcoded main/master)
 * - Authenticated requests when GITHUB_TOKEN is set
 * - Graceful handling of rate limits, 404, private repos
 * - File size and count limits to prevent prompt explosion
 * - Ignores generated/noise directories
 */

const GITHUB_API = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'LaunchLoop/1.0',
  };
  if (GITHUB_TOKEN) {
    h['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  return h;
}

// Directories/files to always ignore
const IGNORE_PATTERNS = [
  'node_modules', '.next', 'dist', 'build', 'coverage', 'vendor', 'target',
  '.git', '.github', '.vscode', '.idea', 'public', '__pycache__',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  '.DS_Store', 'Thumbs.db',
];

const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov',
  '.pdf', '.doc', '.docx',
  '.sqlite', '.db',
];

function shouldIgnorePath(path: string): boolean {
  const parts = path.split('/');
  // Check if any part matches ignore patterns
  if (parts.some(p => IGNORE_PATTERNS.includes(p))) return true;
  // Check binary extensions
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  if (BINARY_EXTENSIONS.includes(ext)) return true;
  return false;
}

export interface RepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  defaultBranch: string;
  stars: number;
  forks: number;
  license: string | null;
  homepage: string | null;
}

export interface FileNode {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/) ||
    url.match(/^([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

async function githubFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: getHeaders() });

  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('rate limit') || res.headers.get('x-ratelimit-remaining') === '0') {
      const resetTime = res.headers.get('x-ratelimit-reset');
      const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString() : 'later';
      throw new Error(`GitHub API rate limit reached. Please try again after ${resetDate}.${!GITHUB_TOKEN ? ' Add a GITHUB_TOKEN environment variable for higher limits.' : ''}`);
    }
    throw new Error('GitHub API access denied. The repository may be private.');
  }

  if (res.status === 404) {
    throw new Error('Repository not found. Make sure the URL is correct and the repository is public.');
  }

  if (res.status === 451) {
    throw new Error('Repository is unavailable for legal reasons.');
  }

  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}). Please try again.`);
  }

  return res;
}

export async function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const res = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`);
  const data = await res.json();

  return {
    owner: data.owner.login,
    repo: data.name,
    fullName: data.full_name,
    description: data.description,
    language: data.language,
    topics: data.topics || [],
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    forks: data.forks_count,
    license: data.license?.spdx_id || null,
    homepage: data.homepage,
  };
}

export async function fetchFileTree(
  owner: string,
  repo: string,
  branch: string
): Promise<FileNode[]> {
  const res = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  const data = await res.json();

  if (!data.tree) {
    throw new Error('Could not fetch repository file tree.');
  }

  // Filter out ignored paths and large files
  const nodes: FileNode[] = data.tree
    .filter((item: { path: string; type: string; size?: number }) => {
      if (shouldIgnorePath(item.path)) return false;
      if (item.type === 'blob' && item.size && item.size > 100_000) return false; // Skip files > 100KB
      return true;
    })
    .map((item: { path: string; type: string; size?: number }) => ({
      path: item.path,
      type: item.type === 'tree' ? 'dir' as const : 'file' as const,
      size: item.size,
    }));

  return nodes;
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  branch: string
): Promise<FileContent | null> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      { headers: getHeaders() }
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (data.encoding === 'base64') {
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { path: filePath, content: content.slice(0, 8000), size: data.size }; // Cap at 8KB
    }
    return { path: filePath, content: (data.content || '').slice(0, 8000), size: data.size };
  } catch {
    return null;
  }
}

export async function fetchKeyFiles(
  owner: string,
  repo: string,
  fileTree: FileNode[],
  branch: string
): Promise<FileContent[]> {
  const allPaths = new Set(fileTree.filter(f => f.type === 'file').map(f => f.path));
  const toFetch: string[] = [];

  // Priority 1: README
  for (const name of ['README.md', 'readme.md', 'README', 'readme']) {
    if (allPaths.has(name)) { toFetch.push(name); break; }
  }

  // Priority 2: Dependency/config files
  for (const name of ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py', 'pom.xml', 'build.gradle']) {
    if (allPaths.has(name)) toFetch.push(name);
  }

  // Priority 3: Entry points
  for (const name of ['app.py', 'main.py', 'main.ts', 'main.js', 'index.ts', 'index.js', 'server.py', 'server.ts', 'server.js', 'manage.py', 'App.tsx', 'App.vue']) {
    if (allPaths.has(name)) toFetch.push(name);
  }

  // Priority 4: Config files
  for (const name of ['.env.example', '.env.sample', '.env.template', 'Dockerfile', 'vercel.json', 'netlify.toml', 'docker-compose.yml']) {
    if (allPaths.has(name)) toFetch.push(name);
  }

  // Priority 5: Schema files (max 5)
  let schemaCount = 0;
  for (const p of allPaths) {
    if ((p.includes('schema') || p.includes('migration') || p.includes('prisma')) && schemaCount < 5) {
      toFetch.push(p);
      schemaCount++;
    }
  }

  // Priority 6: App routes/pages (max 8)
  let routeCount = 0;
  for (const p of allPaths) {
    if (routeCount >= 8) break;
    if (
      (p.includes('/app/') && p.endsWith('page.tsx')) ||
      (p.includes('/pages/') && p.endsWith('.tsx')) ||
      (p.includes('/routes/') && (p.endsWith('.py') || p.endsWith('.ts'))) ||
      (p.includes('/api/') && (p.endsWith('.ts') || p.endsWith('.py') || p.endsWith('.js')))
    ) {
      toFetch.push(p);
      routeCount++;
    }
  }

  // Priority 7: Key components (max 5)
  let compCount = 0;
  for (const p of allPaths) {
    if (compCount >= 5) break;
    if (p.includes('/components/') && (p.endsWith('.tsx') || p.endsWith('.vue') || p.endsWith('.jsx'))) {
      toFetch.push(p);
      compCount++;
    }
  }

  // Deduplicate and limit total
  const uniquePaths = [...new Set(toFetch)].slice(0, 25);

  const results: FileContent[] = [];
  const fetches = uniquePaths.map(async (p) => {
    const content = await fetchFileContent(owner, repo, p, branch);
    if (content) results.push(content);
  });
  await Promise.all(fetches);

  return results;
}

export function getFolderPathStructure(fileTree: FileNode[]): string[] {
  const folders = new Set<string>();
  for (const node of fileTree) {
    if (node.type === 'dir') {
      const parts = node.path.split('/');
      if (parts.length <= 2) folders.add(node.path);
    }
  }
  return Array.from(folders).sort();
}

export interface RepoIntelligence {
  repoInfo: RepoInfo;
  fileTree: FileNode[];
  keyFiles: FileContent[];
  folderStructure: string[];
}

export async function gatherRepoIntelligence(owner: string, repo: string): Promise<RepoIntelligence> {
  // Step 1: Get repo metadata (includes defaultBranch)
  const repoInfo = await fetchRepoInfo(owner, repo);

  // Step 2: Get file tree using the actual default branch
  const fileTree = await fetchFileTree(owner, repo, repoInfo.defaultBranch);

  // Step 3: Get folder structure
  const folderStructure = getFolderPathStructure(fileTree);

  // Step 4: Fetch key files using the same branch
  const keyFiles = await fetchKeyFiles(owner, repo, fileTree, repoInfo.defaultBranch);

  return { repoInfo, fileTree, keyFiles, folderStructure };
}
