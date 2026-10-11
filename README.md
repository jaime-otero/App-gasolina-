# Mi Gasolina ⛽

Web app (PWA) para el iPhone que calcula cuánta gasolina gastas en cada viaje con los coches de la familia (**Papá**, **Mamá** y **Rojo**).

## Qué hace
- **Registrar viajes**: eliges coche, pones los km y te dice al momento los litros gastados
  (`litros = km × consumo / 100`).
- **Calcular los km con el mapa**: pones *Desde* y *Hasta* (o 📍 para usar tu ubicación) y pulsas *Calcular km*.
  Busca las direcciones en OpenStreetMap (Nominatim) y la distancia por carretera con OSRM: gratis, sin clave, pero necesita conexión.
- **Ida / Ida y vuelta**: con un toque se duplican los km (o se vuelven a dividir).
- **Ver en Mapas**: abre la ruta en Apple Maps o Google Maps (se elige en Ajustes), también desde cada viaje del resumen.
- **Consumo predeterminado por coche** (L/100 km), editable en Ajustes. También se puede cambiar en un viaje concreto.
- **Viajes comunes**: guarda trayectos habituales (ej. Casa → Uni) y rellénalos con un toque.
- **Repostaje**: apunta los litros que echas a cada coche. Cuatro gráficas (total y una por coche) comparan los litros
  **gastados** en viajes con los **repuestos**, acumulados en el tiempo, con contadores debajo (gastado, repuesto y diferencia).
- **Resumen** por semana, mes, año o total, con desglose por coche y lista de viajes. Cada viaje se puede editar o borrar.
- Funciona **sin conexión**. Los datos se guardan en el propio móvil; hay exportar/importar para hacer copia.

## Instalar en el iPhone
1. Publicar con GitHub Pages: *Settings → Pages → Deploy from a branch* y elegir la rama y la carpeta `/ (root)`.
2. Abrir la URL en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.

## Desarrollo
Es HTML, CSS y JS sin dependencias. Para probar en local:

```sh
python3 -m http.server 8000
```

Si cambias algún archivo, sube `VERSION` en `sw.js` y el `?v=` de `app.js` y `styles.css` en `index.html`
(los tres al mismo número) para que el móvil descargue la versión nueva entera, sin mezclar archivos.
