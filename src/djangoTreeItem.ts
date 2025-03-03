import * as vscode from 'vscode';
import * as path from 'path';

export class DjangoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly resourceUri?: vscode.Uri,
    public readonly contextValue?: string
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    if (resourceUri) {
      this.resourceUri = resourceUri;
    }
    if (contextValue) {
      this.contextValue = contextValue;
    }
  }
}
