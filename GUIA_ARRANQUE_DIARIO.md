\# 🚀 Guía de arranque diario — Doce Escalones v8



Sigue estos pasos EN ORDEN cada vez que vayas a programar en la academia.



\---



\## PASO 1 — Encender el sobremesa de la academia

Enciende el PC de sobremesa normalmente. Es el que tiene PostgreSQL

(la base de datos real). Déjalo encendido todo el rato que programes.



No hace falta abrir nada más en el sobremesa (ni pgAdmin, ni nada).

Solo tiene que estar encendido y conectado a la red WiFi/cable.



\---



\## PASO 2 — En tu portátil: arrancar el BACKEND



Abre una terminal (cmd) y pega esto línea por línea:



```cmd

cd C:\\Users\\xarxa\\Desktop\\doce-escalones-v8\\backend

.venv\\Scripts\\activate

uvicorn main:app --reload --host 0.0.0.0 --port 8000

```



✅ Sabrás que ha ido bien si ves al final:

```

INFO:     Application startup complete.

```



❌ Si ves `Connect call failed` → el sobremesa no está accesible

(comprueba que está encendido y en la misma red).



\*\*Deja esta terminal abierta\*\* — no la cierres mientras programes.



\---



\## PASO 3 — En otra terminal: arrancar el FRONTEND WEB (opcional)



Solo si vas a trabajar también en la web (no en el móvil):



```cmd

cd C:\\Users\\xarxa\\Desktop\\doce-escalones-v8\\frontend-web

npm run dev

```



Abre el navegador en `http://localhost:3000` (o el puerto que indique).



\---



\## PASO 4 — Arrancar el EMULADOR ANDROID (para Flutter)



1\. Abre \*\*Android Studio\*\*

2\. Ve a \*\*Device Manager\*\* (icono de móvil en la barra lateral derecha)

3\. Pulsa ▶️ \*\*Play\*\* en el emulador `sdk gphone16k`

4\. Espera a que cargue completamente (verás la pantalla de inicio de Android)



\---



\## PASO 5 — En otra terminal: arrancar FLUTTER



Con el emulador ya abierto y cargado:



```cmd

cd C:\\Users\\xarxa\\Desktop\\doce-escalones-v8\\flutter-app

flutter run

```



✅ Si aparece una lista de dispositivos preguntando cuál usar,

elige el número del emulador `sdk gphone16k`.



✅ Sabrás que ha ido bien si ves:

```

Flutter run key commands.

r Hot reload.

R Hot restart.

```



\---



\## 🔁 Comandos útiles MIENTRAS programamos (sin reiniciar todo)



Con `flutter run` ya corriendo, en esa misma terminal puedes escribir:



| Tecla | Qué hace | Cuándo usarlo |

|---|---|---|

| `r` | Hot reload | Cambios pequeños de texto/estilos |

| `R` | Hot restart | Cambios de estructura de widgets, imports nuevos |

| `q` | Salir | Para parar Flutter del todo |



\*\*Regla simple:\*\* si después de `r` algo raro persiste, prueba `R`.

Si después de `R` sigue igual de raro, para todo con `q` y haz:

```cmd

flutter clean

flutter pub get

flutter run

```

(Esto es más lento pero borra cualquier caché corrupta.)



\---



\## 🛑 Para cerrar todo al terminar de programar



1\. En la terminal de Flutter: pulsa `q`

2\. En la terminal de uvicorn: `Ctrl + C`

3\. En la terminal de npm (si la abriste): `Ctrl + C`

4\. Cierra el emulador desde Android Studio (Device Manager → Stop)

5\. Apaga el sobremesa de la academia si vas a salir del local



\---



\## 📌 Resumen ultra-rápido (cuando ya sepas lo que haces)



```cmd

:: Terminal 1

cd C:\\Users\\xarxa\\Desktop\\doce-escalones-v8\\backend

.venv\\Scripts\\activate

uvicorn main:app --reload --host 0.0.0.0 --port 8000



:: Terminal 2 (Android Studio: arrancar emulador primero)

cd C:\\Users\\xarxa\\Desktop\\doce-escalones-v8\\flutter-app

flutter run

```

