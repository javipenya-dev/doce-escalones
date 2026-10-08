from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuración de la aplicación.
    Pydantic-settings lee automáticamente del archivo .env.
    """
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    PORT: int = 8000

    # ── Impresora térmica por red ──
    IMPRESORA_IP: str | None = None
    IMPRESORA_PUERTO: int = 9100

    # ── SMTP (avisos de backup por email) ──
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM: str | None = None
    BACKUP_EMAILS: str = ""

    # ── Email periódico con el backup adjunto ──
    # Cada cuántos días se envía el backup por email (7 = semanal, 14 = quincenal, 0 = desactivado)
    BACKUP_EMAIL_DIAS: int = 7

    # ── Directorio donde se guardan los backups ──
    # Si no se define, se usa el por defecto: backend/media/backups/
    BACKUP_DIR: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )


settings = Settings()