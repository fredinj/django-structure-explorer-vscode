import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DjangoTreeItem } from './djangoTreeItem';
import { DjangoProjectAnalyzer } from './djangoProjectAnalyzer';

export class DjangoStructureProvider implements vscode.TreeDataProvider<DjangoTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DjangoTreeItem | undefined | null | void> = new vscode.EventEmitter<DjangoTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DjangoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private analyzer: DjangoProjectAnalyzer;
  private projectRoot: string | undefined;

  constructor() {
    this.analyzer = new DjangoProjectAnalyzer();
    this.projectRoot = this.findDjangoProjectRoot();
  }

  refresh(): void {
    this.projectRoot = this.findDjangoProjectRoot();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DjangoTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DjangoTreeItem): Promise<DjangoTreeItem[]> {
    if (!this.projectRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Nivel raíz - mostrar la estructura principal del proyecto
      return this.getProjectStructure();
    } else if (element.contextValue === 'app') {
      // Nivel de aplicación - mostrar modelos, vistas, etc.
      return this.getAppStructure(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'models') {
      // Mostrar los modelos de la aplicación
      return this.getModels(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'views') {
      // Mostrar las vistas de la aplicación
      return this.getViews(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'urls') {
      // Mostrar las URLs de la aplicación
      return this.getUrls(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'admin') {
      // Mostrar las clases de admin de la aplicación
      return this.getAdminClasses(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'main-urls') {
      // Mostrar las URLs globales del proyecto
      return this.getUrls(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'settings') {
      // Mostrar las variables definidas en settings.py
      return this.getSettings(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'model') {
      // Mostrar los campos de un modelo
      return this.getModelFields(element);
    }

    return [];
  }

  private findDjangoProjectRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return undefined;
    }

    for (const folder of workspaceFolders) {
      const managePyPath = path.join(folder.uri.fsPath, 'manage.py');
      if (fs.existsSync(managePyPath)) {
        return folder.uri.fsPath;
      }
    }

    return undefined;
  }

  private async getProjectStructure(): Promise<DjangoTreeItem[]> {
    if (!this.projectRoot) {
      return [];
    }

    const items: DjangoTreeItem[] = [];

    // Añadir settings
    const settingsFiles = await this.analyzer.findSettingsFiles(this.projectRoot);
    if (settingsFiles.length > 0) {
      const settingsItem = new DjangoTreeItem(
        'Settings',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Settings',
          arguments: [settingsFiles[0]]
        },
        vscode.Uri.file(path.dirname(settingsFiles[0])),
        'settings'
      );
      settingsItem.iconPath = new vscode.ThemeIcon('settings-gear');
      items.push(settingsItem);
    }

    // Añadir urls.py principal
    const mainUrlsFile = await this.analyzer.findMainUrlsFile(this.projectRoot);
    if (mainUrlsFile) {
      const urlsItem = new DjangoTreeItem(
        'URLs',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir URLs',
          arguments: [mainUrlsFile]
        },
        vscode.Uri.file(mainUrlsFile),
        'main-urls'
      );
      urlsItem.iconPath = new vscode.ThemeIcon('link');
      items.push(urlsItem);
    }

    // Añadir aplicaciones
    const apps = await this.analyzer.findDjangoApps(this.projectRoot);
    for (const app of apps) {
      const appName = path.basename(app);
      const appItem = new DjangoTreeItem(
        appName,
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        vscode.Uri.file(app),
        'app'
      );
      appItem.iconPath = new vscode.ThemeIcon('package');
      items.push(appItem);
    }

    return items;
  }

  private async getAppStructure(appPath: string): Promise<DjangoTreeItem[]> {
    const items: DjangoTreeItem[] = [];
    const appName = path.basename(appPath);

    // Modelos
    const modelsPath = path.join(appPath, 'models.py');
    if (fs.existsSync(modelsPath)) {
      const modelsItem = new DjangoTreeItem(
        'Modelos',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Modelos',
          arguments: [modelsPath]
        },
        vscode.Uri.file(modelsPath),
        'models'
      );
      modelsItem.iconPath = new vscode.ThemeIcon('database');
      items.push(modelsItem);
    }

    // Vistas
    const viewsPath = path.join(appPath, 'views.py');
    if (fs.existsSync(viewsPath)) {
      const viewsItem = new DjangoTreeItem(
        'Vistas',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Vistas',
          arguments: [viewsPath]
        },
        vscode.Uri.file(viewsPath),
        'views'
      );
      viewsItem.iconPath = new vscode.ThemeIcon('eye');
      items.push(viewsItem);
    }

    // URLs
    const urlsPath = path.join(appPath, 'urls.py');
    if (fs.existsSync(urlsPath)) {
      const urlsItem = new DjangoTreeItem(
        'URLs',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir URLs',
          arguments: [urlsPath]
        },
        vscode.Uri.file(urlsPath),
        'urls'
      );
      urlsItem.iconPath = new vscode.ThemeIcon('link');
      items.push(urlsItem);
    }

    // Admin
    const adminPath = path.join(appPath, 'admin.py');
    if (fs.existsSync(adminPath)) {
      const adminItem = new DjangoTreeItem(
        'Admin',
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Admin',
          arguments: [adminPath]
        },
        vscode.Uri.file(adminPath),
        'admin'
      );
      adminItem.iconPath = new vscode.ThemeIcon('shield');
      items.push(adminItem);
    }

    return items;
  }

  private async getModels(modelsPath: string): Promise<DjangoTreeItem[]> {
    const models = await this.analyzer.extractModels(modelsPath);
    return models.map(model => {
      const modelItem = new DjangoTreeItem(
        model.name,
        model.fields && model.fields.length > 0 
          ? vscode.TreeItemCollapsibleState.Collapsed 
          : vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Modelo',
          arguments: [modelsPath, model.lineNumber]
        },
        vscode.Uri.file(modelsPath),
        'model'
      );
      modelItem.iconPath = new vscode.ThemeIcon('symbol-class');
      
      // Almacenar los campos del modelo en el elemento para acceder a ellos más tarde
      modelItem.tooltip = `Modelo: ${model.name}`;
      modelItem.description = `${model.fields?.length || 0} campos`;
      
      // Guardar los campos en una propiedad personalizada
      (modelItem as any).modelFields = model.fields;
      
      return modelItem;
    });
  }

  private async getViews(viewsPath: string): Promise<DjangoTreeItem[]> {
    const views = await this.analyzer.extractViews(viewsPath);
    return views.map(view => {
      const viewItem = new DjangoTreeItem(
        view.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Vista',
          arguments: [viewsPath, view.lineNumber]
        },
        vscode.Uri.file(viewsPath),
        'view'
      );
      viewItem.iconPath = view.isClass 
        ? new vscode.ThemeIcon('symbol-class') 
        : new vscode.ThemeIcon('symbol-method');
      return viewItem;
    });
  }

  private async getUrls(urlsPath: string): Promise<DjangoTreeItem[]> {
    const urls = await this.analyzer.extractUrls(urlsPath);
    return urls.map(url => {
      const urlItem = new DjangoTreeItem(
        url.pattern,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir URL',
          arguments: [urlsPath, url.lineNumber]
        },
        vscode.Uri.file(urlsPath),
        'url'
      );
      urlItem.description = url.viewName;
      urlItem.iconPath = new vscode.ThemeIcon('link');
      return urlItem;
    });
  }

  private async getAdminClasses(adminPath: string): Promise<DjangoTreeItem[]> {
    const adminClasses = await this.analyzer.extractAdminClasses(adminPath);
    return adminClasses.map(adminClass => {
      const adminItem = new DjangoTreeItem(
        adminClass.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Clase Admin',
          arguments: [adminPath, adminClass.lineNumber]
        },
        vscode.Uri.file(adminPath),
        'admin-class'
      );
      adminItem.iconPath = new vscode.ThemeIcon('symbol-class');
      return adminItem;
    });
  }

  private async getSettings(settingsDir: string): Promise<DjangoTreeItem[]> {
    const settingsFiles = await this.analyzer.findSettingsFiles(this.projectRoot!);
    if (settingsFiles.length === 0) {
      return [];
    }
    
    const settingsPath = settingsFiles[0];
    const settings = await this.analyzer.extractSettings(settingsPath);
    
    return settings.map(setting => {
      const settingItem = new DjangoTreeItem(
        setting.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Setting',
          arguments: [settingsPath, setting.lineNumber]
        },
        vscode.Uri.file(settingsPath),
        'setting'
      );
      settingItem.description = setting.value;
      settingItem.iconPath = new vscode.ThemeIcon('symbol-constant');
      return settingItem;
    });
  }

  private async getModelFields(modelItem: DjangoTreeItem): Promise<DjangoTreeItem[]> {
    // Recuperar los campos del modelo almacenados en el elemento
    const fields = (modelItem as any).modelFields || [];
    const modelsPath = modelItem.resourceUri!.fsPath;
    
    return fields.map((field: any) => {
      const fieldItem = new DjangoTreeItem(
        field.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Abrir Campo',
          arguments: [modelsPath, field.lineNumber]
        },
        vscode.Uri.file(modelsPath),
        'model-field'
      );
      fieldItem.iconPath = new vscode.ThemeIcon('symbol-field');
      fieldItem.description = field.fieldType;
      return fieldItem;
    });
  }
}
