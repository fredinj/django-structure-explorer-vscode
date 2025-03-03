# Guía Rápida para el Desarrollo de la Extensión

## Estructura del Proyecto

* `package.json` - Manifiesto de la extensión
* `tsconfig.json` - Configuración del compilador TypeScript
* `src/extension.ts` - Punto de entrada principal de la extensión
* `src/djangoStructureProvider.ts` - Proveedor de datos para la vista de árbol
* `src/djangoTreeItem.ts` - Clase para los elementos del árbol
* `src/djangoProjectAnalyzer.ts` - Analizador de proyectos Django

## Comenzar

1. Instala las dependencias:
   ```
   npm install
   ```

2. Compila la extensión:
   ```
   npm run compile
   ```

3. Presiona F5 para abrir una nueva ventana con la extensión cargada.

## Hacer cambios

* Los cambios en el código se recargarán automáticamente cuando guardes los archivos.
* Puedes volver a cargar (`Ctrl+R` o `Cmd+R` en Mac) la ventana de VS Code para cargar los cambios.

## Explorar la API

* Puedes abrir la documentación completa de la API de VS Code en https://code.visualstudio.com/api

## Empaquetar la extensión

* Para empaquetar la extensión:
   ```
   npm run vscode:prepublish
   ```

* Instala la herramienta VSCE:
   ```
   npm install -g vsce
   ```

* Empaqueta la extensión:
   ```
   vsce package
   ```

Esto generará un archivo `.vsix` que puedes instalar manualmente en VS Code.
