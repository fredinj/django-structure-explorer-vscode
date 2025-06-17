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
  private gitignorePatterns: string[] = [];
  private compiledGitignorePatterns: Map<string, RegExp> = new Map();
  private configCache: { [key: string]: any } = {};
  private fileExistsCache: Map<string, boolean> = new Map();
  private directoryListCache: Map<string, string[]> = new Map();
  private lastCacheTime: number = 0;
  private readonly cacheTtl = 30000; // 30 seconds
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    this.analyzer = new DjangoProjectAnalyzer();
    this.projectRoot = this.findDjangoProjectRoot();
    this.loadGitignorePatterns();
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    // Watch for .gitignore and manage.py changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/{.gitignore,manage.py}');
    
    this.fileWatcher.onDidChange(() => {
      this.clearCaches();
      this.refresh();
    });
    
    this.fileWatcher.onDidCreate(() => {
      this.clearCaches();
      this.refresh();
    });
    
    this.fileWatcher.onDidDelete(() => {
      this.clearCaches();
      this.refresh();
    });
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
  }

  refresh(): void {
    this.clearCaches();
    this.projectRoot = this.findDjangoProjectRoot();
    this.loadGitignorePatterns();
    this._onDidChangeTreeData.fire();
  }

  private clearCaches(): void {
    this.configCache = {};
    this.fileExistsCache.clear();
    this.directoryListCache.clear();
    this.compiledGitignorePatterns.clear();
    this.lastCacheTime = 0;
  }

  private isCacheValid(): boolean {
    return Date.now() - this.lastCacheTime < this.cacheTtl;
  }

  private getCachedConfig<T>(key: string, defaultValue: T): T {
    if (!this.configCache[key] || !this.isCacheValid()) {
      const config = vscode.workspace.getConfiguration('djangoStructureExplorer');
      this.configCache[key] = config.get(key, defaultValue);
      this.lastCacheTime = Date.now();
    }
    return this.configCache[key] as T;
  }

  getTreeItem(element: DjangoTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DjangoTreeItem): Promise<DjangoTreeItem[]> {
    if (!this.projectRoot) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level - show main project structure
      return this.getProjectStructure();
    } else if (element.contextValue === 'config') {
      // Configuration group - show settings and main URLs
      const items: DjangoTreeItem[] = [];
      
      // Add settings
      const settingsFiles = await this.analyzer.findSettingsFiles(this.projectRoot);
      if (settingsFiles.length > 0) {
        const settingsItem = new DjangoTreeItem(
          'Settings',
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            command: 'djangoStructureExplorer.openFile',
            title: 'Open Settings',
            arguments: [settingsFiles[0]]
          },
          vscode.Uri.file(path.dirname(settingsFiles[0])),
          'settings'
        );
        settingsItem.iconPath = new vscode.ThemeIcon('settings-gear');
        items.push(settingsItem);
      }

      // Add main urls.py
      const mainUrlsFile = await this.analyzer.findMainUrlsFile(this.projectRoot);
      if (mainUrlsFile) {
        const urlsItem = new DjangoTreeItem(
          'URLs',
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            command: 'djangoStructureExplorer.openFile',
            title: 'Open URLs',
            arguments: [mainUrlsFile]
          },
          vscode.Uri.file(mainUrlsFile),
          'main-urls'
        );
        urlsItem.iconPath = new vscode.ThemeIcon('link');
        items.push(urlsItem);
      }

      return items;
    } else if (element.contextValue === 'apps') {
      // Applications group - show all apps
      const apps = await this.analyzer.findDjangoApps(this.projectRoot);
      return Promise.all(apps.map(app => {
        const appName = path.basename(app);
        const appItem = new DjangoTreeItem(
          appName,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          vscode.Uri.file(app),
          'app'
        );
        appItem.iconPath = new vscode.ThemeIcon('package');
        return appItem;
      }));
    } else if (element.contextValue === 'app') {
      // Application level - show models, views, etc.
      return this.getAppStructure(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'models') {
      // Show models
      return this.getModels(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'views') {
      // Show views
      return this.getViews(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'urls') {
      // Show URLs
      return this.getUrls(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'admin') {
      // Show admin classes
      return this.getAdminClasses(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'main-urls') {
      // Show global URLs
      return this.getUrls(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'settings') {
      // Show settings variables
      return this.getSettings(element.resourceUri!.fsPath);
    } else if (element.contextValue === 'model') {
      return this.getModelFields(element);
    }
    return [];
  }

  private findDjangoProjectRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return undefined;
    }

    const searchDepth = this.getCachedConfig('searchDepth', 3);

    for (const folder of workspaceFolders) {
      const result = this.searchForManagePy(folder.uri.fsPath, searchDepth);
      if (result) {
        return result;
      }
    }

    return undefined;
  }

  private cachedFileExists(filePath: string): boolean {
    if (this.fileExistsCache.has(filePath) && this.isCacheValid()) {
      return this.fileExistsCache.get(filePath)!;
    }
    
    const exists = fs.existsSync(filePath);
    this.fileExistsCache.set(filePath, exists);
    return exists;
  }

  private cachedReadDir(dirPath: string): string[] | null {
    if (this.directoryListCache.has(dirPath) && this.isCacheValid()) {
      return this.directoryListCache.get(dirPath)!;
    }
    
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
      this.directoryListCache.set(dirPath, entries);
      return entries;
    } catch (error) {
      this.directoryListCache.set(dirPath, []);
      return null;
    }
  }

private searchForManagePy(directory: string, depth: number): string | undefined {
  if (depth <= 0) {
    return undefined;
  }

  // Check for manage.py in current directory (with caching)
  const managePyPath = path.join(directory, 'manage.py');
  if (this.cachedFileExists(managePyPath)) {
    return directory;
  }

  // If depth > 1, search subdirectories
  if (depth > 1) {
    const dirNames = this.cachedReadDir(directory);
    if (dirNames) {
      for (const dirName of dirNames) {
        const subdirPath = path.join(directory, dirName);
        
        // Check if directory should be ignored based on .gitignore
        if (this.isIgnoredByGitignore(subdirPath, dirName)) {
          continue;
        }

        const result = this.searchForManagePy(subdirPath, depth - 1);
        if (result) {
          return result;
        }
      }
    }
  }

  return undefined;
}

  private loadGitignorePatterns(): void {
    this.gitignorePatterns = [];
    this.compiledGitignorePatterns.clear();
    
    if (!this.projectRoot) {
      return;
    }

    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        this.gitignorePatterns = gitignoreContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
          .map(pattern => {
            // Remove trailing slashes and normalize patterns
            return pattern.replace(/\/$/, '');
          });
        
        // Pre-compile regex patterns for better performance
        this.gitignorePatterns.forEach(pattern => {
          if (pattern.includes('*')) {
            try {
              const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
              const regex = new RegExp(`^${escapedPattern}$`, 'i');
              this.compiledGitignorePatterns.set(pattern, regex);
            } catch (error) {
              console.warn(`Failed to compile regex for pattern: ${pattern}`, error);
            }
          }
        });
        
        console.log(`Django Structure Explorer: Loaded ${this.gitignorePatterns.length} gitignore patterns from ${gitignorePath}`);
      } catch (error) {
        console.warn('Django Structure Explorer: Failed to read .gitignore:', error);
      }
    } else {
      console.log('Django Structure Explorer: No .gitignore file found, using default ignore patterns');
    }

    // Add basic patterns that should always be ignored for performance
    this.gitignorePatterns.push('.git', '.vscode', '__pycache__');
  }

  private isIgnoredByGitignore(dirPath: string, baseName: string): boolean {
    // Always ignore these for performance (pre-lowercased for efficiency)
    const baseNameLower = baseName.toLowerCase();
    const alwaysIgnore = ['.git', '.vscode', '__pycache__'];
    if (alwaysIgnore.includes(baseNameLower)) {
      return true;
    }

    if (this.gitignorePatterns.length === 0) {
      return false;
    }

    const relativePath = this.projectRoot ? path.relative(this.projectRoot, dirPath).replace(/\\/g, '/') : baseName;
    const relativePathLower = relativePath.toLowerCase();
    
    return this.gitignorePatterns.some(pattern => {
      try {
        // Handle different gitignore pattern types
        if (pattern.includes('*')) {
          // Use pre-compiled regex for wildcard patterns
          const compiledRegex = this.compiledGitignorePatterns.get(pattern);
          if (compiledRegex) {
            return compiledRegex.test(baseName) || compiledRegex.test(relativePath);
          }
          // Fallback if regex compilation failed
          return false;
        } else if (pattern.startsWith('/')) {
          // Root-relative patterns
          const rootPattern = pattern.substring(1);
          return relativePath === rootPattern || relativePath.startsWith(rootPattern + '/');
        } else {
          // Simple name matching (optimized with pre-lowercased strings)
          const patternLower = pattern.toLowerCase();
          return baseNameLower === patternLower || 
                 relativePathLower === patternLower || 
                 relativePathLower.includes('/' + patternLower + '/') ||
                 relativePathLower.endsWith('/' + patternLower);
        }
      } catch (error) {
        // If anything fails, fall back to simple string matching
        return baseNameLower.includes(pattern.toLowerCase());
      }
    });
  }

  private async getProjectStructure(): Promise<DjangoTreeItem[]> {
    if (!this.projectRoot) {
      return [];
    }

    const items: DjangoTreeItem[] = [];

    // Add configuration files group
    const configItem = new DjangoTreeItem(
      'Configuration',
      vscode.TreeItemCollapsibleState.Expanded,  // Mostrar expandido por defecto
      undefined,
      undefined,
      'config'
    );
    configItem.iconPath = new vscode.ThemeIcon('gear');
    items.push(configItem);

    // Add applications group
    const appsItem = new DjangoTreeItem(
      'Applications',
      vscode.TreeItemCollapsibleState.Expanded,  // Mostrar expandido por defecto
      undefined,
      undefined,
      'apps'
    );
    appsItem.iconPath = new vscode.ThemeIcon('layers');
    items.push(appsItem);

    return this.sortItems(items);
  }

  private sortItems(items: DjangoTreeItem[]): DjangoTreeItem[] {
    const sortOrder = this.getCachedConfig('sortOrder', 'alphabetical');
    
    if (sortOrder === 'alphabetical') {
      return items.sort((a, b) => a.label.toString().localeCompare(b.label.toString()));
    } else if (sortOrder === 'alphabeticalDesc') {
      return items.sort((a, b) => b.label.toString().localeCompare(a.label.toString()));
    }
    
    return items; // codeOrder - mantener el orden original
  }

  private async getAppStructure(appPath: string): Promise<DjangoTreeItem[]> {
    const items: DjangoTreeItem[] = [];
    const appName = path.basename(appPath);

    // Define all possible Django app files to check
    const appFiles = [
      { name: 'models.py', label: 'Models', contextValue: 'models', icon: 'database' },
      { name: 'views.py', label: 'Views', contextValue: 'views', icon: 'eye' },
      { name: 'urls.py', label: 'URLs', contextValue: 'urls', icon: 'link' },
      { name: 'admin.py', label: 'Admin', contextValue: 'admin', icon: 'shield' }
    ];

    // Use cached file existence checks for better performance
    for (const file of appFiles) {
      const filePath = path.join(appPath, file.name);
      if (this.cachedFileExists(filePath)) {
        const item = new DjangoTreeItem(
          file.label,
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            command: 'djangoStructureExplorer.openFile',
            title: `Open ${file.label}`,
            arguments: [filePath]
          },
          vscode.Uri.file(filePath),
          file.contextValue
        );
        item.iconPath = new vscode.ThemeIcon(file.icon);
        items.push(item);
      }
    }

    return items;
  }

  private async getModels(modelsPath: string): Promise<DjangoTreeItem[]> {
    const models = await this.analyzer.extractModels(modelsPath);
    console.log('Models found:', models.length);
    
    const items = models.map(model => {
      console.log(`Model: ${model.name}, Fields: ${model.fields?.length || 0}`);
      if (model.fields) {
        console.log('Model fields:', JSON.stringify(model.fields));
      }
      
      // Create a copy of fields to avoid reference issues
      const fieldsData = model.fields ? [...model.fields] : [];
      
      const modelItem = new DjangoTreeItem(
        model.name,
        fieldsData.length > 0 
          ? vscode.TreeItemCollapsibleState.Collapsed 
          : vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Open Model',
          arguments: [modelsPath, model.lineNumber]
        },
        vscode.Uri.file(modelsPath),
        'model'
      );
      modelItem.iconPath = new vscode.ThemeIcon('symbol-class');
      
      // Store model fields in the tree item for later access
      modelItem.tooltip = `Model: ${model.name}`;
      modelItem.description = `${fieldsData.length} fields`;
      
      // Store fields as custom data since we can't modify command directly
      (modelItem as any).modelFields = fieldsData;
      
      return modelItem;
    });

    return this.sortItems(items);
  }

  private async getViews(viewsPath: string): Promise<DjangoTreeItem[]> {
    const views = await this.analyzer.extractViews(viewsPath);
    const items = views.map(view => {
      const viewItem = new DjangoTreeItem(
        view.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Open View',
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

    return this.sortItems(items);
  }

  private async getUrls(urlsPath: string): Promise<DjangoTreeItem[]> {
    const urls = await this.analyzer.extractUrls(urlsPath);
    const items = urls.map(url => {
      const urlItem = new DjangoTreeItem(
        url.pattern,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Open URL',
          arguments: [urlsPath, url.lineNumber]
        },
        vscode.Uri.file(urlsPath),
        'url'
      );
      urlItem.description = url.viewName;
      urlItem.iconPath = new vscode.ThemeIcon('link');
      return urlItem;
    });

    return this.sortItems(items);
  }

  private async getAdminClasses(adminPath: string): Promise<DjangoTreeItem[]> {
    const adminClasses = await this.analyzer.extractAdminClasses(adminPath);
    const items = adminClasses.map(adminClass => {
      const adminItem = new DjangoTreeItem(
        adminClass.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Open Admin Class',
          arguments: [adminPath, adminClass.lineNumber]
        },
        vscode.Uri.file(adminPath),
        'admin-class'
      );
      adminItem.iconPath = new vscode.ThemeIcon('symbol-class');
      return adminItem;
    });

    return this.sortItems(items);
  }

  private async getSettings(settingsDir: string): Promise<DjangoTreeItem[]> {
    const settingsFiles = await this.analyzer.findSettingsFiles(this.projectRoot!);
    if (settingsFiles.length === 0) {
      return [];
    }
    
    const settingsPath = settingsFiles[0];
    const settings = await this.analyzer.extractSettings(settingsPath);
    
    const items = settings.map(setting => {
      const settingItem = new DjangoTreeItem(
        setting.name,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'djangoStructureExplorer.openFile',
          title: 'Open Setting',
          arguments: [settingsPath, setting.lineNumber]
        },
        vscode.Uri.file(settingsPath),
        'setting'
      );
      settingItem.description = setting.value;
      settingItem.iconPath = new vscode.ThemeIcon('symbol-constant');
      return settingItem;
    });

    return this.sortItems(items);
  }

  private async getModelFields(modelItem: DjangoTreeItem): Promise<DjangoTreeItem[]> {
    // Get model fields stored in the tree item
    const fields = (modelItem as any).modelFields || [];
    const modelsPath = modelItem.resourceUri!.fsPath;
    
    // If no fields, try to get them again
    if (fields.length === 0) {
      try {
        // Try to extract the model again to get its fields
        const models = await this.analyzer.extractModels(modelsPath);
        const modelName = modelItem.label?.toString() || '';
        const model = models.find(m => m.name === modelName);
        
        if (model && model.fields && model.fields.length > 0) {
          (modelItem as any).modelFields = model.fields;
          return this.getModelFields(modelItem);
        }
      } catch (error) {
        console.error('Error al intentar obtener campos del modelo:', error);
      }
    }
    
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
        field.isProperty ? 'model-property' : 'model-field'
      );
      
      // Usar un icono diferente para propiedades
      if (field.isProperty) {
        fieldItem.iconPath = new vscode.ThemeIcon('symbol-method');
      } else {
        fieldItem.iconPath = new vscode.ThemeIcon('symbol-field');
      }
      
      // Usar fieldType o type, dependiendo de cuál esté disponible
      fieldItem.description = field.fieldType || field.type || 'Unknown';
      fieldItem.tooltip = `${field.isProperty ? 'Propiedad' : 'Campo'}: ${field.name}\nTipo: ${field.fieldType || field.type || 'Unknown'}`;
      return fieldItem;
    });
  }
}
