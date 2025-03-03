import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

export interface DjangoModel {
  name: string;
  lineNumber: number;
}

export interface DjangoView {
  name: string;
  lineNumber: number;
  isClass: boolean;
}

export interface DjangoUrl {
  pattern: string;
  viewName: string;
  lineNumber: number;
}

export interface DjangoAdminClass {
  name: string;
  lineNumber: number;
  modelName: string;
}

export interface DjangoSetting {
  name: string;
  value: string;
  lineNumber: number;
}

export class DjangoProjectAnalyzer {
  
  /**
   * Busca todos los archivos settings.py en el proyecto
   */
  async findSettingsFiles(projectRoot: string): Promise<string[]> {
    const settingsFiles: string[] = [];
    
    const dirs = await this.getDirectories(projectRoot);
    for (const dir of dirs) {
      const settingsPath = path.join(dir, 'settings.py');
      if (fs.existsSync(settingsPath)) {
        settingsFiles.push(settingsPath);
      }
    }
    
    return settingsFiles;
  }
  
  /**
   * Busca el archivo urls.py principal del proyecto
   */
  async findMainUrlsFile(projectRoot: string): Promise<string | undefined> {
    const dirs = await this.getDirectories(projectRoot);
    for (const dir of dirs) {
      const urlsPath = path.join(dir, 'urls.py');
      if (fs.existsSync(urlsPath)) {
        // Verificar si es el urls.py principal (contiene ROOT_URLCONF o urlpatterns)
        const content = await readFile(urlsPath, 'utf8');
        if (content.includes('ROOT_URLCONF') || content.includes('urlpatterns')) {
          return urlsPath;
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * Busca todas las aplicaciones Django en el proyecto
   */
  async findDjangoApps(projectRoot: string): Promise<string[]> {
    const apps: string[] = [];
    const dirs = await this.getDirectories(projectRoot);
    
    for (const dir of dirs) {
      // Verificar si es una aplicación Django (contiene apps.py o models.py)
      const appsPyPath = path.join(dir, 'apps.py');
      const modelsPyPath = path.join(dir, 'models.py');
      
      if (fs.existsSync(appsPyPath) || fs.existsSync(modelsPyPath)) {
        apps.push(dir);
      }
    }
    
    return apps;
  }
  
  /**
   * Extrae los modelos de un archivo models.py
   */
  async extractModels(modelsPath: string): Promise<DjangoModel[]> {
    const models: DjangoModel[] = [];
    
    try {
      const content = await readFile(modelsPath, 'utf8');
      const lines = content.split('\n');
      
      // Expresión regular para encontrar clases de modelo
      const modelRegex = /^class\s+(\w+)\s*\(\s*models\.Model/;
      
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(modelRegex);
        if (match) {
          models.push({
            name: match[1],
            lineNumber: i
          });
        }
      }
    } catch (error) {
      console.error(`Error al analizar modelos: ${error}`);
    }
    
    return models;
  }
  
  /**
   * Extrae las vistas de un archivo views.py
   */
  async extractViews(viewsPath: string): Promise<DjangoView[]> {
    const views: DjangoView[] = [];
    
    try {
      const content = await readFile(viewsPath, 'utf8');
      const lines = content.split('\n');
      
      // Expresión regular para encontrar funciones de vista
      const functionViewRegex = /^def\s+(\w+)\s*\(/;
      // Expresión regular para encontrar clases de vista
      const classViewRegex = /^class\s+(\w+)\s*\(/;
      
      for (let i = 0; i < lines.length; i++) {
        const functionMatch = lines[i].match(functionViewRegex);
        if (functionMatch) {
          views.push({
            name: functionMatch[1],
            lineNumber: i,
            isClass: false
          });
          continue;
        }
        
        const classMatch = lines[i].match(classViewRegex);
        if (classMatch) {
          views.push({
            name: classMatch[1],
            lineNumber: i,
            isClass: true
          });
        }
      }
    } catch (error) {
      console.error(`Error al analizar vistas: ${error}`);
    }
    
    return views;
  }
  
  /**
   * Extrae las URLs de un archivo urls.py
   */
  async extractUrls(urlsPath: string, prefix: string = ''): Promise<DjangoUrl[]> {
    const urls: DjangoUrl[] = [];
    
    try {
      const content = await readFile(urlsPath, 'utf8');
      const lines = content.split('\n');
      
      // Expresiones regulares para encontrar patrones de URL
      const pathRegex = /path\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+(?:\.\w+)*)/;
      const rePathRegex = /re_path\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+(?:\.\w+)*)/;
      const urlRegex = /url\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+(?:\.\w+)*)/;
      
      // Expresión regular para encontrar includes
      const includeRegex = /include\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"]\s*)?\)/;
      
      for (let i = 0; i < lines.length; i++) {
        // Buscar patrones de URL directos
        let match = lines[i].match(pathRegex) || lines[i].match(rePathRegex) || lines[i].match(urlRegex);
        if (match) {
          const pattern = prefix + match[1];
          urls.push({
            pattern: pattern,
            viewName: match[2],
            lineNumber: i
          });
          continue;
        }
        
        // Buscar includes
        const includeMatch = lines[i].match(includeRegex);
        if (includeMatch) {
          const includedModule = includeMatch[1];
          const includePrefix = includeMatch[2] || '';
          
          // Determinar la ruta del archivo incluido
          let includedFilePath = '';
          if (includedModule.endsWith('.urls')) {
            // Convertir formato de módulo a ruta de archivo
            const parts = includedModule.split('.');
            const appName = parts[0];
            
            // Buscar la aplicación en el proyecto
            const projectRoot = path.dirname(path.dirname(urlsPath));
            const appPath = path.join(projectRoot, appName);
            
            if (fs.existsSync(appPath)) {
              includedFilePath = path.join(appPath, 'urls.py');
            }
          }
          
          if (includedFilePath && fs.existsSync(includedFilePath)) {
            // Combinar prefijos
            const newPrefix = prefix + (includePrefix ? includePrefix : '');
            
            // Extraer URLs del archivo incluido con el prefijo actualizado
            const includedUrls = await this.extractUrls(includedFilePath, newPrefix);
            urls.push(...includedUrls);
          }
        }
      }
    } catch (error) {
      console.error(`Error al analizar URLs: ${error}`);
    }
    
    return urls;
  }
  
  /**
   * Extrae las clases de admin de un archivo admin.py
   */
  async extractAdminClasses(adminPath: string): Promise<DjangoAdminClass[]> {
    const adminClasses: DjangoAdminClass[] = [];
    
    try {
      const content = await readFile(adminPath, 'utf8');
      
      // Buscar todas las clases de admin
      const classRegex = /class\s+(\w+)\s*\(\s*(?:admin\.)?(\w+Admin|TabularInline|StackedInline)\s*\)/g;
      let classMatch;
      while ((classMatch = classRegex.exec(content)) !== null) {
        const adminClass: DjangoAdminClass = {
          name: classMatch[1],
          lineNumber: content.substring(0, classMatch.index).split('\n').length - 1,
          modelName: ''
        };
        
        // Buscar el modelo asociado
        const modelRegex = new RegExp(`model\\s*=\\s*(\\w+)`, 'g');
        const modelContent = content.substring(classMatch.index, content.length);
        const modelMatch = modelRegex.exec(modelContent);
        if (modelMatch) {
          adminClass.modelName = modelMatch[1];
        }
        
        adminClasses.push(adminClass);
      }
      
      // Buscar registros directos con admin.site.register
      const registerRegex = /admin\.site\.register\s*\(\s*(\w+)(?:\s*,\s*(\w+))?\s*\)/g;
      let registerMatch;
      while ((registerMatch = registerRegex.exec(content)) !== null) {
        const modelName = registerMatch[1];
        const adminClassName = registerMatch[2] || 'ModelAdmin';
        
        adminClasses.push({
          name: adminClassName,
          lineNumber: content.substring(0, registerMatch.index).split('\n').length - 1,
          modelName: modelName
        });
      }
      
      // Buscar decoradores de register
      const decoratorRegex = /@admin\.register\s*\(\s*(\w+)\s*\)\s*\n+\s*class\s+(\w+)/g;
      let decoratorMatch;
      while ((decoratorMatch = decoratorRegex.exec(content)) !== null) {
        const modelName = decoratorMatch[1];
        const adminClassName = decoratorMatch[2];
        
        adminClasses.push({
          name: adminClassName,
          lineNumber: content.substring(0, decoratorMatch.index).split('\n').length - 1,
          modelName: modelName
        });
      }
      
    } catch (error) {
      console.error(`Error al analizar clases de admin: ${error}`);
    }
    
    return adminClasses;
  }
  
  /**
   * Extrae las variables definidas en un archivo settings.py
   */
  async extractSettings(settingsPath: string): Promise<DjangoSetting[]> {
    const settings: DjangoSetting[] = [];
    
    try {
      const content = await readFile(settingsPath, 'utf8');
      const lines = content.split('\n');
      
      // Expresión regular para encontrar definiciones de variables
      const settingRegex = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Ignorar comentarios y líneas vacías
        if (line.startsWith('#') || line === '') {
          continue;
        }
        
        const match = line.match(settingRegex);
        if (match) {
          let value = match[2].trim();
          
          // Eliminar comentarios al final de la línea
          const commentIndex = value.indexOf('#');
          if (commentIndex > 0) {
            value = value.substring(0, commentIndex).trim();
          }
          
          // Manejar valores multilínea
          if ((value.includes('{') && !value.includes('}')) || 
              (value.includes('[') && !value.includes(']')) ||
              (value.includes('(') && !value.includes(')'))) {
            
            // Buscar el final de la definición multilínea
            let j = i + 1;
            let multilineValue = value;
            
            while (j < lines.length) {
              const nextLine = lines[j].trim();
              multilineValue += ' ' + nextLine;
              
              if ((value.includes('{') && nextLine.includes('}')) || 
                  (value.includes('[') && nextLine.includes(']')) ||
                  (value.includes('(') && nextLine.includes(')'))) {
                break;
              }
              
              j++;
            }
            
            value = multilineValue;
          }
          
          settings.push({
            name: match[1],
            value: value,
            lineNumber: i
          });
        }
      }
    } catch (error) {
      console.error(`Error al analizar settings: ${error}`);
    }
    
    return settings;
  }
  
  /**
   * Obtiene todos los directorios en un directorio dado
   */
  private async getDirectories(dir: string): Promise<string[]> {
    const dirs: string[] = [];
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('__')) {
          dirs.push(fullPath);
          
          // Recursivamente buscar en subdirectorios
          const subdirs = await this.getDirectories(fullPath);
          dirs.push(...subdirs);
        }
      }
    } catch (error) {
      console.error(`Error al leer directorios: ${error}`);
    }
    
    return dirs;
  }
}
