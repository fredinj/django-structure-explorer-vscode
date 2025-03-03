import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DjangoStructureProvider } from './djangoStructureProvider';
import { DjangoTreeItem } from './djangoTreeItem';

export function activate(context: vscode.ExtensionContext) {
  console.log('La extensión "Django Structure Explorer" está activa');

  // Crear el proveedor de datos para la vista de árbol
  const djangoStructureProvider = new DjangoStructureProvider();
  
  // Registrar la vista de árbol
  vscode.window.registerTreeDataProvider(
    'djangoStructureExplorer',
    djangoStructureProvider
  );

  // Comando para refrescar la vista
  const refreshCommand = vscode.commands.registerCommand(
    'djangoStructureExplorer.refresh',
    () => djangoStructureProvider.refresh()
  );

  // Comando para abrir un archivo
  const openFileCommand = vscode.commands.registerCommand(
    'djangoStructureExplorer.openFile',
    (filePath: string, lineNumber?: number) => {
      if (fs.existsSync(filePath)) {
        vscode.workspace.openTextDocument(filePath).then(doc => {
          vscode.window.showTextDocument(doc).then(editor => {
            if (lineNumber !== undefined) {
              const position = new vscode.Position(lineNumber, 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
              );
            }
          });
        });
      } else {
        vscode.window.showErrorMessage(`El archivo ${filePath} no existe.`);
      }
    }
  );

  context.subscriptions.push(refreshCommand);
  context.subscriptions.push(openFileCommand);
}

export function deactivate() {}
