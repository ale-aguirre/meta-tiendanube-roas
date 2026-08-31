# credentials/

Esta carpeta guarda archivos que **nunca** se versionan. `.gitignore` la cubre
entera salvo este README y el `.gitkeep`.

Para una instalación nueva no hace falta nada acá: toda la configuración vive
en el `.env` de la raíz. Estos archivos existen por dos motivos.

| Archivo | Qué es | Quién lo escribe |
|---|---|---|
| `meta-dashboard-token.json` | Token de Meta vigente | El dashboard, al renovarlo solo |
| `tiendanube-token.json` | Token + `store_id` de la tienda | `npm run setup:tiendanube` |
| `.env.meta-ads` | `META_APP_ID` / `META_APP_SECRET` | Formato viejo, se sigue leyendo |
| `dashboard-config.json` | `openrouter_key` | Formato viejo, se sigue leyendo |

1. **El token de Meta tiene que poder reescribirse.** Cuando el dashboard lo
   renueva vía `fb_exchange_token`, guarda el nuevo en
   `meta-dashboard-token.json`. Un `.env` no se reescribe solo.
2. **Compatibilidad.** Las versiones anteriores guardaban todo acá. Si estos
   archivos existen, se siguen leyendo; el `.env` tiene prioridad.

Si alguna vez estos archivos se filtran a un commit: rotá los tokens en Meta y
en Tiendanube **antes** de reescribir el historial. Borrar el commit no
invalida un token que ya salió del repositorio.
