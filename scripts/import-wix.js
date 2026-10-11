/** Importa el contenido del Wix anterior desde la terminal: `npm run import:wix`. */
import { runWixImport } from '../src/services/wix-import.js';

const r = await runWixImport();
console.log(`\nListo: ${r.columns} columnas, ${r.magazines} revistas, ${r.episodes} episodios nuevos.`);
