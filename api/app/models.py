import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: new_id("user"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, default="agente")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Guard(Base):
    __tablename__ = "guards"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: new_id("guard"))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[str] = mapped_column(Text, nullable=False)
    end_time: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    chief_user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class GuardMember(Base):
    __tablename__ = "guard_members"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: new_id("member"))
    guard_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    role: Mapped[str] = mapped_column(Text, nullable=False, default="agente")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GuardEvent(Base):
    __tablename__ = "guard_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: new_id("event"))
    guard_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    event_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Person(Base):
    __tablename__ = "people"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: new_id("person"))
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    eri: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    device: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="ACTIVO")
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GuardHandover(Base):
    __tablename__ = "guard_handovers"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: new_id("handover"))
    guard_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    open_events: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
