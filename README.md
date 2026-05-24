# GNZ Web Apps - GitHub Pages + Apps Script Unificado

Este repositorio contiene las tres paginas de GNZ listas para publicarse juntas en GitHub Pages y conectadas a un solo backend de Google Apps Script.

## Paginas

- `docs/index.html`: GNZ Oil Services.
- `docs/frenos.html`: GNZ Brake & Flush Services.
- `docs/admin.html`: panel privado de administracion.

En GitHub Pages quedaran asi:

- Aceite: `https://TU_USUARIO.github.io/TU_REPO/`
- Frenos/flush: `https://TU_USUARIO.github.io/TU_REPO/frenos.html`
- Admin: `https://TU_USUARIO.github.io/TU_REPO/admin.html`

En el admin, usa las pestañas `Oil` y `Brakes / Flush` para crear citas de aceite o citas de frenos/fluidos desde el mismo panel.

Las tres paginas incluyen selector de idioma `EN / ES`. La preferencia se guarda en el navegador, asi que el cliente o el admin vuelve a ver el ultimo idioma elegido.

## Backend unico

El backend unificado esta en:

- `apps-script/unified/code.gs`
- `apps-script/unified/appsscript.json`

Ese unico `code.gs` contiene:

- Reservas de aceite.
- Reservas de frenos y flush.
- Panel admin.
- Creacion de citas de aceite, frenos y flush desde el panel admin.
- Lectura/escritura del Google Sheet.
- Calculo de precios.
- Correos al cliente y admin.
- PDFs de recibo.
- Botones de cambio de estado desde email.
- Recordatorios.
- Email de review al completar una cita.
- Boton manual en admin para enviar el correo de review de Google Maps.
- Correos y recibos redisenados con el estilo visual de GNZ.
- Paginas en ingles y espanol con selector de idioma guardado.
- Cache de vehiculos y precios.
- Proteccion contra horarios duplicados.
- Bloqueo temporal del admin despues de intentos fallidos.
- Modo prueba para redirigir correos.

El Google Sheet usado sigue siendo:

```text
10Oh3tfaoLOg1UtKKuVmFHdZ9wW2TDIo4jB5WuzDlUyY
```

## Publicar el backend

1. Abre Google Apps Script.
2. Crea un proyecto nuevo o reemplaza el proyecto que quieras usar como backend unico.
3. Copia `apps-script/unified/code.gs` como `code.gs`.
4. Copia `apps-script/unified/appsscript.json` como manifest.
5. Ve a `Deploy > New deployment`.
6. Tipo: `Web app`.
7. `Execute as`: `Me`.
8. `Who has access`: `Anyone`.
9. Copia la URL que termina en `/exec`.

Luego reemplaza en los tres HTML:

```text
REPLACE_WITH_UNIFIED_APPS_SCRIPT_WEB_APP_URL
```

por esa URL `/exec`.

Tambien puedes probar sin editar archivos abriendo cualquier pagina con:

```text
?endpoint=URL_DEL_WEB_APP_UNIFICADO
```

Ejemplo:

```text
admin.html?endpoint=https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec
```

La URL se guarda en `localStorage` para las siguientes visitas desde el mismo navegador.

## Configuracion recomendada en Apps Script

En `Project Settings > Script Properties`, agrega al menos `ADMIN_PASSWORD` para que el panel admin pueda iniciar sesion sin exponer la clave en GitHub:

```text
ADMIN_PASSWORD = tu_clave_segura
TEST_MODE = NO
TEST_EMAIL = gnzoilservices@gmail.com
```

Tambien puedes actualizar la clave admin ejecutando manualmente esta funcion desde Apps Script:

```js
configurarGnzAdminPassword("tu_clave_segura")
```

Para probar sin enviar correos reales a clientes:

```js
configurarGnzTestMode(true, "gnzoilservices@gmail.com")
```

Para volver a modo real:

```js
configurarGnzTestMode(false)
```

## Diagnostico rapido

Despues de publicar el Web App, puedes probar lectura de vehiculos abriendo:

```text
TU_URL_EXEC?debug=vehiculos
```

Debe mostrar cuantas filas se cargaron desde `Vehiculos2`.

## Publicar GitHub Pages

1. Sube este repo a GitHub.
2. Abre `Settings > Pages`.
3. En `Build and deployment`, selecciona `Deploy from a branch`.
4. Selecciona la rama principal y la carpeta `/docs`.
5. Guarda.

## Notas

- GitHub Pages solo publica HTML/CSS/JS. Google Apps Script sigue siendo necesario porque GitHub no puede enviar correos, generar PDFs, usar triggers ni escribir directamente en Google Sheets.
- Las tres paginas usan `docs/assets/js/apps-script-bridge.js` para llamar el unico `code.gs`: lectura rapida por JSONP y envios por `POST` con consulta segura del resultado.
- La pagina de aceite enlaza internamente a `frenos.html`, por lo que ambas paginas quedan conectadas dentro del mismo sitio de GitHub.
- El logo esta en `docs/assets/img/gnz-logo.png` y el favicon en `docs/favicon.ico`.
- Los botones de estado enviados por correo usan automaticamente la URL real del Web App desplegado. Si quieres forzar una URL fija, reemplaza `REPLACE_WITH_UNIFIED_APPS_SCRIPT_WEB_APP_URL` dentro de `apps-script/unified/code.gs`.
