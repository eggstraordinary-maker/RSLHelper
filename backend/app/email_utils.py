import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Template
from app.config import settings
import os


def send_email(to_email: str, subject: str, body_html: str) -> bool:
    """Отправка email через SMTP"""
    try:
        msg = MIMEMultipart()
        msg["From"] = settings.email_from
        msg["To"] = to_email
        msg["Subject"] = subject

        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)

        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def send_verification_email(email: str, verification_url: str) -> bool:
    """Отправка email для подтверждения регистрации"""
    template_path = os.path.join(os.path.dirname(__file__), "templates", "verification_email.html")

    with open(template_path, "r", encoding="utf-8") as f:
        template = Template(f.read())

    body = template.render(
        verification_url=verification_url,
        frontend_url=settings.frontend_url
    )

    subject = "Подтверждение регистрации - Жестовый помощник"
    return send_email(email, subject, body)


def send_password_reset_email(email: str, reset_url: str) -> bool:
    """Отправка email для сброса пароля"""
    template_path = os.path.join(os.path.dirname(__file__), "templates", "reset_password.html")

    with open(template_path, "r", encoding="utf-8") as f:
        template = Template(f.read())

    body = template.render(
        reset_url=reset_url,
        frontend_url=settings.frontend_url
    )

    subject = "Сброс пароля - Жестовый помощник"
    return send_email(email, subject, body)
