/**
 * GitHub Repository Intelligence Service
 * Fetches repo metadata, file tree, and key file contents.
 */

const GITHUB_API = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const headers: Record<string, string> = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'LaunchLoop/1.0',
};
if (GITHUB_TOKEN) {
  headers['Authorization'] = `token ${GITHUB_TOKEN}`;
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
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle both https://github.com/owner/repo and owner/repo formats
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/) ||
    url.match(/^([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

export async function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers });
  if (!res.ok) throw new Error(`GitHub repo not found: ${owner}/${repo}`);
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
  branch: string = 'main'
): Promise<FileNode[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!res.ok) {
    // Try master branch if main fails
    if (branch === 'main') {
      return fetchFileTree(owner, repo, 'master');
    }
    throw new Error(`Failed to fetch file tree: ${res.status}`);
  }
  const data = await res.json();

  const nodes: FileNode[] = data.tree.map((item: { path: string; type: string; size?: number }) => ({
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
  branch: string = 'main'
): Promise<FileContent | null> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (data.encoding === 'base64') {
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { path: filePath, content, size: data.size };
    }
    return { path: filePath, content: data.content || '', size: data.size };
  } catch {
    return null;
  }
}

// Key files to look for in a repository
const KEY_FILES = [
  'README.md', 'readme.md', 'README', 'readme',
  'package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'setup.py', 'setup.cfg',
  '.env.example', '.env.sample', '.env.template',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  'app.py', 'main.py', 'main.ts', 'main.js', 'index.ts', 'index.js',
  'server.py', 'server.ts', 'server.js',
  'app.json', 'vercel.json', 'netlify.toml',
  'schema.sql', 'schema.ts', 'schema.prisma', 'prisma/schema.prisma',
  'src/App.tsx', 'src/App.tsx', 'src/app/layout.tsx', 'src/app/page.tsx',
  'pages/index.tsx', 'pages/_app.tsx',
  'lib/', 'src/lib/', 'src/components/',
];

export async function fetchKeyFiles(
  owner: string,
  repo: string,
  fileTree: FileNode[],
  branch: string = 'main'
): Promise<FileContent[]> {
  const allPaths = new Set(fileTree.filter(f => f.type === 'file').map(f => f.path));

  // Priority files to fetch
  const toFetch: string[] = [];

  // Always try README
  for (const name of ['README.md', 'readme.md', 'README', 'readme']) {
    if (allPaths.has(name) && !toFetch.includes(name)) {
      toFetch.push(name);
      break;
    }
  }

  // Package/dependency files
  for (const name of ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py']) {
    if (allPaths.has(name)) toFetch.push(name);
  }

  // Entry points
  for (const name of ['app.py', 'main.py', 'main.ts', 'main.js', 'index.ts', 'index.js', 'server.py', 'server.ts', 'server.js']) {
    if (allPaths.has(name)) toFetch.push(name);
  }

  // Config files
  for (const name of ['.env.example', '.env.sample', 'docker-compose.yml', 'Dockerfile', 'vercel.json']) {
    if (allPaths.has(name)) toFetch.push(name);
  }

  // Schema files
  for (const path of allPaths) {
    if (
      path.includes('schema') ||
      path.includes('migration') ||
      path.includes('prisma')
    ) {
      if (toFetch.length < 25) toFetch.push(path);
    }
  }

  // App routes/pages - scan for route patterns
  for (const path of allPaths) {
    if (
      (path.includes('/app/') && path.endsWith('page.tsx')) ||
      (path.includes('/pages/') && path.endsWith('.tsx')) ||
      (path.includes('/routes/') && path.endsWith('.py')) ||
      (path.includes('/api/') && (path.endsWith('.ts') || path.endsWith('.py') || path.endsWith('.js')))
    ) {
      if (toFetch.length < 30) toFetch.push(path);
    }
  }

  // Components
  for (const path of allPaths) {
    if (path.includes('/components/') && (path.endsWith('.tsx') || path.endsWith('.vue'))) {
      if (toFetch.length < 35) toFetch.push(path);
    }
  }

  // Limit total fetches
  const finalPaths = toFetch.slice(0, 35);

  const results: FileContent[] = [];
  const fetches = finalPaths.map(async (p) => {
    const content = await fetchFileContent(owner, repo, p, branch);
    if (content && content.size < 50000) {
      results.push(content);
    }
  });
  await Promise.all(fetches);

  return results;
}

export function getFolderPathStructure(fileTree: FileNode[]): string[] {
  const folders = new Set<string>();
  for (const node of fileTree) {
    if (node.type === 'dir') {
      const parts = node.path.split('/');
      if (parts.length <= 2) {
        folders.add(node.path);
      }
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
  const [repoInfo, fileTree] = await Promise.all([
    fetchRepoInfo(owner, repo),
    fetchFileTree(owner, repo),
  ]);

  const branch = repoInfo.defaultBranch;
  const folderStructure = getFolderPathStructure(fileTree);
  const keyFiles = await fetchKeyFiles(owner, repo, fileTree, branch);

  return { repoInfo, fileTree, keyFiles, folderStructure };
}
