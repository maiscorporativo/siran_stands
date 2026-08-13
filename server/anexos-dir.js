/* Diretório privado de anexos e contratos.
   Fica fora de public/ e de UPLOADS_DIR de propósito: guarda documentos
   de clientes, que só podem sair por rota autenticada. Vive em módulo
   próprio para ser compartilhado sem criar dependência circular entre
   as rotas e a geração de contratos. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const anexosDir = process.env.ANEXOS_DIR
  ? path.resolve(process.env.ANEXOS_DIR)
  : path.join(__dirname, '..', 'anexos_privados');

fs.mkdirSync(anexosDir, { recursive: true });
