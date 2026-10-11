# Mi Gasolina ⛽

Web app (PWA) para el iPhone que calcula cuánta gasolina gastas en cada viaje con los coches de la familia (**Papá**, **Mamá** y **Rojo**).

## Qué hace
- **Registrar viajes**: eliges coche, pones los km y te dice al momento los litros gastados
  (`litros = km × consumo / 100`).
- **Consumo predeterminado por coche** (L/100 km), editable en Ajustes. También se puede cambiar en un viaje concreto.
- **Viajes comunes**: guarda trayectos habituales (ej. Casa → Uni) y rellénalos con un toque.
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

Si cambias algún archivo, sube la versión de `CACHE` en `sw.js` para que el móvil descargue la nueva.
