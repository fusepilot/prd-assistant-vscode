import * as vscode from 'vscode';

export class PrdDocumentLinkProvider implements vscode.DocumentLinkProvider {
    private readonly prdIdRegex = /PRD-\d{6}/g;

    async provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentLink[]> {
        const links: vscode.DocumentLink[] = [];
        const text = document.getText();

        let match;
        while ((match = this.prdIdRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            // Search for the task in all workspace files
            const targetUri = await this.findTaskLocation(match[0]);
            
            if (targetUri) {
                const link = new vscode.DocumentLink(range, targetUri);
                link.tooltip = `Go to ${match[0]}`;
                links.push(link);
            }
        }

        return links;
    }

    private async findTaskLocation(taskId: string): Promise<vscode.Uri | undefined> {
        // Search for the task ID in all markdown files
        const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
        
        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            const text = document.getText();
            
            // Look for the task ID in comments
            const regex = new RegExp(`<!--\\s*${taskId}\\s*-->`, 'g');
            const match = regex.exec(text);
            
            if (match) {
                const position = document.positionAt(match.index);
                // Create a URI with the file path and position
                return vscode.Uri.parse(`${file.toString()}#L${position.line + 1}`);
            }
        }

        return undefined;
    }

    resolveDocumentLink?(link: vscode.DocumentLink, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink> {
        // The link is already resolved in provideDocumentLinks
        return link;
    }
}