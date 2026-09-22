from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuración de la aplicación.

    Pydantic-settings lee automáticamente del archivo .env (si existe) y de
    las variables de entorno del sistema. Las variables de entorno tienen
    prioridad sobre el .env.

    NO usar os.getenv() como default: pydantic ya lo hace por nosotros y
    mezclarlo duplica lógica y produce bugs difíciles de trazar.
    """
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    PORT: int = 8000
    # ── NUEVO: impresora térmica por red ──
    IMPRESORA_IP: str | None = None
    IMPRESORA_PUERTO: int = 9100

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


settings = Settings()