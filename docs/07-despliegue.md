# 07 — Despliegue

## Entorno de producción

El sistema corre en el **PC torre de la academia** con Windows.
No hay servidores externos ni dependencias de internet.

---

## Requisitos del PC

| Componente | Mínimo | Recomendado |
|-----------|--------|-------------|
| RAM | 4 GB | 8 GB |
| Disco | 20 GB libres | 50 GB libres |
| SO | Windows 10 | Windows 10/11 |
| Red | WiFi o Ethernet | Ethernet (más estable) |

---

## Instalación desde cero

### Paso 1 — Instalar Docker Desktop
1. Descargar desde: https://www.docker.com/products/docker-desktop/
2. Instalar y reiniciar el PC
3. Abrir Docker Desktop y esperar a que el icono de la ballena esté verde

### Paso 2 — Copiar el proyecto
```
Descomprimir doce-escalones.zip en:
C:\Users\TuUsuario\Desktop\doce-escalones\
```

### Paso 3 — Configurar el entorno
```bash
# En la carpeta del proyecto, copiar el fichero de ejemplo
copy .env.example .env

# Abrir .env con el Bloc de notas y rellenar:
# - POSTGRES_PASSWORD=una_contraseña_segura
# - SECRET_KEY=una_clave_larga_y_aleatoria
# - PC_IP=192.168.1.XX  ← tu IP en la WiFi de la academia
```

**Cómo encontrar la IP del PC:**
```
1. Abrir cmd (tecla Windows + R → escribir cmd → Enter)
2. Escribir: ipconfig
3. Buscar "Adaptador de LAN inalámbrica Wi-Fi"
4. Copiar el valor de "Dirección IPv4" (ej: 192.168.1.50)
```

### Paso 4 — Arrancar
```bash
# Abrir cmd en la carpeta del proyecto
cd C:\Users\TuUsuario\Desktop\doce-escalones
docker-compose up -d
```

Primera vez: descarga imágenes (~5 minutos según la conexión).
Siguientes veces: arranca en ~10 segundos.

### Paso 5 — Verificar
Abrir en el navegador:
```
http://localhost:3000     ← Panel admin
http://localhost:8000     ← API (debe mostrar {"message":"Academia API funcionando ✓"})
```

---

## Arranque automático con Windows

Para que el sistema arranque solo cuando se enciende el PC:

1. Crear el fichero `arrancar-academia.bat`:
```batch
@echo off
cd /d C:\Users\TuUsuario\Desktop\doce-escalones
docker-compose up -d
```

2. Colocar el acceso directo a este `.bat` en:
```
C:\Users\TuUsuario\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

Docker Desktop también necesita estar configurado para arrancar con Windows (opción en su configuración).

---

## Actualizar el sistema

Cuando haya nuevas versiones:

```bash
cd C:\Users\TuUsuario\Desktop\doce-escalones

# Parar el sistema
docker-compose down

# Copiar los nuevos ficheros (sin tocar .env ni la carpeta de datos)

# Reconstruir y arrancar
docker-compose up -d --build
```

> ⚠️ Nunca borrar el volumen `postgres_data` — contiene todos los datos de la academia.

---

## Backups

### Backup manual de la base de datos
```bash
# En cmd, desde la carpeta del proyecto:
docker exec academia_db pg_dump -U academia_user academia > backup_%date%.sql
```

### Backup automático semanal
Crear tarea programada en Windows que ejecute:
```batch
@echo off
set fecha=%date:~6,4%%date:~3,2%%date:~0,2%
docker exec academia_db pg_dump -U academia_user academia > C:\Backups\academia_%fecha%.sql
```

Guardar los backups en una carpeta que se sincronice con Google Drive o un disco externo.

---

## Comandos útiles

```bash
# Ver si todo está funcionando
docker-compose ps

# Ver logs del backend (útil para errores)
docker-compose logs -f backend

# Ver logs de la base de datos
docker-compose logs -f db

# Parar el sistema
docker-compose down

# Parar y eliminar contenedores (sin borrar datos)
docker-compose down

# Reiniciar solo el backend (tras cambios)
docker-compose restart backend

# Acceder a la base de datos directamente
docker exec -it academia_db psql -U academia_user -d academia
```

---

## Acceso desde móviles

Una vez el sistema está corriendo en el PC, cualquier dispositivo en la **misma red WiFi** puede acceder:

- **Panel web:** `http://192.168.1.50:3000`
- **API:** `http://192.168.1.50:8000`

La app Flutter debe tener configurada la IP del PC en sus ajustes.

> 💡 **Consejo:** Asignar una IP fija al PC en la configuración del router de la academia para que la IP nunca cambie.

---

## Futuro: acceso remoto (opcional)

Si en algún momento se quisiera acceder desde fuera de la academia (desde casa, por ejemplo), habría que añadir:

1. **HTTPS** con certificado (Let's Encrypt o similar)
2. **Restricción de CORS** en el backend
3. **VPN** (más seguro) o apertura de puerto en el router
4. **Autenticación más robusta** (2FA recomendado)

Esto no está en el alcance actual del proyecto.
