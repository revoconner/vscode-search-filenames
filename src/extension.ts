import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

type SortMode = 'name' | 'path' | 'ext';

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly fileName: string,
        public readonly relativePath: string
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);
        this.tooltip = relativePath;
        this.description = path.dirname(relativePath);
        this.resourceUri = uri;
        this.contextValue = 'fileItem';
    }
}

class FileFilterProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private pattern: string = '';
    private files: FileItem[] = [];
    private sortMode: SortMode = 'name';
    private hideIgnored: boolean = false;
    private ignoredPatterns: string[] = [];
    private watcher: vscode.FileSystemWatcher | undefined;

    constructor() {
        this.setupWatcher();
        this.loadGitignore();
    }

    private setupWatcher() {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.watcher.onDidCreate(() => this.refresh());
        this.watcher.onDidDelete(() => this.refresh());
        this.watcher.onDidChange(() => this.refresh());
    }

    private async loadGitignore() {
        this.ignoredPatterns = ['node_modules'];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const gitignorePath = path.join(workspaceFolders[0].uri.fsPath, '.gitignore');
        try {
            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                const patterns = content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                this.ignoredPatterns.push(...patterns);
            }
        } catch {}
    }

    private isIgnored(relativePath: string): boolean {
        if (!this.hideIgnored) return false;

        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        for (const pattern of this.ignoredPatterns) {
            const normalizedPattern = pattern.replace(/\\/g, '/');
            
            if (normalizedPattern.endsWith('/')) {
                const dirPattern = normalizedPattern.slice(0, -1);
                if (normalizedPath.startsWith(dirPattern + '/') || normalizedPath === dirPattern) {
                    return true;
                }
            }
            
            if (normalizedPath.includes('/' + normalizedPattern + '/') || 
                normalizedPath.startsWith(normalizedPattern + '/') ||
                normalizedPath.endsWith('/' + normalizedPattern) ||
                normalizedPath === normalizedPattern) {
                return true;
            }

            try {
                const regexPattern = normalizedPattern
                    .replace(/\./g, '\\.')
                    .replace(/\*\*/g, '{{GLOBSTAR}}')
                    .replace(/\*/g, '[^/]*')
                    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
                    .replace(/\?/g, '.');
                const regex = new RegExp(`(^|/)${regexPattern}($|/)`);
                if (regex.test(normalizedPath)) return true;
            } catch {}
        }
        return false;
    }

    async setPattern(pattern: string) {
        this.pattern = pattern;
        await this.refresh();
    }

    async setSortMode(mode: SortMode) {
        this.sortMode = mode;
        await this.refresh();
    }

    async toggleHideIgnored(): Promise<boolean> {
        this.hideIgnored = !this.hideIgnored;
        await this.loadGitignore();
        await this.refresh();
        return this.hideIgnored;
    }

    async refresh() {
        if (!this.pattern) {
            this.files = [];
            this._onDidChangeTreeData.fire();
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        let matcher: (filePath: string) => boolean;

        if (this.pattern.startsWith('r:')) {
            try {
                const regex = new RegExp(this.pattern.slice(2), 'i');
                matcher = (p) => regex.test(p);
            } catch {
                vscode.window.showErrorMessage('Invalid regex pattern');
                return;
            }
        } else if (this.pattern.startsWith('g:')) {
            const globPattern = this.pattern.slice(2);
            const regexPattern = globPattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '{{GLOBSTAR}}')
                .replace(/\*/g, '[^/\\\\]*')
                .replace(/\{\{GLOBSTAR\}\}/g, '.*')
                .replace(/\?/g, '.');
            try {
                const regex = new RegExp(regexPattern, 'i');
                matcher = (p) => regex.test(p);
            } catch {
                vscode.window.showErrorMessage('Invalid glob pattern');
                return;
            }
        } else {
            const escaped = this.pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            const regex = new RegExp(escaped, 'i');
            matcher = (p) => regex.test(p);
        }

        try {
            const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 10000);
            const rootPath = workspaceFolders[0].uri.fsPath;

            this.files = uris
                .map(uri => {
                    const relativePath = path.relative(rootPath, uri.fsPath);
                    const fileName = path.basename(uri.fsPath);
                    return new FileItem(uri, fileName, relativePath);
                })
                .filter(item => matcher(item.relativePath))
                .filter(item => !this.isIgnored(item.relativePath));

            this.sortFiles();
            this._onDidChangeTreeData.fire();
        } catch (err) {
            vscode.window.showErrorMessage(`Error: ${err}`);
        }
    }

    private sortFiles() {
        switch (this.sortMode) {
            case 'name':
                this.files.sort((a, b) => a.fileName.localeCompare(b.fileName));
                break;
            case 'path':
                this.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
                break;
            case 'ext':
                this.files.sort((a, b) => {
                    const extA = path.extname(a.fileName);
                    const extB = path.extname(b.fileName);
                    return extA.localeCompare(extB) || a.fileName.localeCompare(b.fileName);
                });
                break;
        }
    }

    clear() {
        this.pattern = '';
        this.files = [];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    getChildren(): FileItem[] {
        return this.files;
    }

    dispose() {
        this.watcher?.dispose();
    }
}

async function computeHash(uri: vscode.Uri, algorithm: string): Promise<string> {
    const content = await fs.promises.readFile(uri.fsPath);
    
    if (algorithm === 'sha3-256') {
        const { SHA3 } = require('sha3');
        const hash = new SHA3(256);
        hash.update(content);
        return hash.digest('hex');
    }
    
    return crypto.createHash(algorithm).update(content).digest('hex');
}

export function activate(context: vscode.ExtensionContext) {
    const provider = new FileFilterProvider();
    
    const treeView = vscode.window.createTreeView('fileFilter.fileList', {
        treeDataProvider: provider,
        showCollapseAll: false
    });

    context.subscriptions.push(
        treeView,
        
        vscode.commands.registerCommand('fileFilter.search', async () => {
            const pattern = await vscode.window.showInputBox({
                prompt: 'Enter search pattern (prefix: r: for regex, g: for glob)',
                placeHolder: '*.json, r:\\.tsx?$, g:**/src/*.ts'
            });
            if (pattern !== undefined) {
                await provider.setPattern(pattern);
            }
        }),

        vscode.commands.registerCommand('fileFilter.refresh', () => provider.refresh()),
        
        vscode.commands.registerCommand('fileFilter.clear', () => provider.clear()),

        vscode.commands.registerCommand('fileFilter.toggleGitignore', async () => {
            const hidden = await provider.toggleHideIgnored();
            vscode.window.showInformationMessage(
                hidden ? 'Hiding gitignored files' : 'Showing all files'
            );
        }),

        vscode.commands.registerCommand('fileFilter.sortByName', () => provider.setSortMode('name')),
        vscode.commands.registerCommand('fileFilter.sortByPath', () => provider.setSortMode('path')),
        vscode.commands.registerCommand('fileFilter.sortByExtension', () => provider.setSortMode('ext')),

        vscode.commands.registerCommand('fileFilter.openFile', (item: FileItem) => {
            vscode.window.showTextDocument(item.uri);
        }),

        vscode.commands.registerCommand('fileFilter.revealInExplorer', (item: FileItem) => {
            vscode.commands.executeCommand('revealFileInOS', item.uri);
        }),

        vscode.commands.registerCommand('fileFilter.copyPath', (item: FileItem) => {
            vscode.env.clipboard.writeText(item.uri.fsPath);
            vscode.window.showInformationMessage('Path copied');
        }),

        vscode.commands.registerCommand('fileFilter.copyRelativePath', (item: FileItem) => {
            vscode.env.clipboard.writeText(item.relativePath);
            vscode.window.showInformationMessage('Relative path copied');
        }),

        vscode.commands.registerCommand('fileFilter.hashMD5', async (item: FileItem) => {
            const hash = await computeHash(item.uri, 'md5');
            vscode.env.clipboard.writeText(hash);
            vscode.window.showInformationMessage(`MD5: ${hash}`);
        }),

        vscode.commands.registerCommand('fileFilter.hashSHA256', async (item: FileItem) => {
            const hash = await computeHash(item.uri, 'sha256');
            vscode.env.clipboard.writeText(hash);
            vscode.window.showInformationMessage(`SHA-256: ${hash}`);
        }),

        vscode.commands.registerCommand('fileFilter.hashSHA512', async (item: FileItem) => {
            const hash = await computeHash(item.uri, 'sha512');
            vscode.env.clipboard.writeText(hash);
            vscode.window.showInformationMessage(`SHA-512: ${hash}`);
        }),

        vscode.commands.registerCommand('fileFilter.hashSHA3', async (item: FileItem) => {
            const hash = await computeHash(item.uri, 'sha3-256');
            vscode.env.clipboard.writeText(hash);
            vscode.window.showInformationMessage(`SHA3-256: ${hash}`);
        })
    );
}

export function deactivate() {}