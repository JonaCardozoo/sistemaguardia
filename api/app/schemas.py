from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, model_validator


# ---- Auth ----

class UserCreate(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=1)
    role: str = "agente"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: str

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Guards ----

class GuardMemberCreate(BaseModel):
    user_id: str
    role: str = "Agente"


class GuardMemberOut(BaseModel):
    user_id: str
    name: str
    role: str


class GuardCreate(BaseModel):
    date: date
    start_time: str
    end_time: str
    members: list[GuardMemberCreate] | None = None


class GuardOut(BaseModel):
    id: str
    date: date
    start_time: str
    end_time: str
    status: str
    chief_user_id: str
    chief_name: str = ""
    members: list[GuardMemberOut] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---- Events ----

class EventCreate(BaseModel):
    event_data: dict[str, Any]


class EventUpdate(BaseModel):
    event_data: dict[str, Any]


class EventActionCreate(BaseModel):
    action: dict[str, Any]


class EventOut(BaseModel):
    id: str
    guard_id: str
    event_data: dict[str, Any]
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---- People ----

class PersonCreate(BaseModel):
    name: str | None = None
    eri: str | None = None
    location: str | None = None
    device: str | None = None

    @model_validator(mode="after")
    def require_name_or_eri(self):
        if not (self.name and self.name.strip()) and not (self.eri and self.eri.strip()):
            raise ValueError("Se requiere name o eri")
        return self


class PersonUpdate(BaseModel):
    name: str | None = None
    eri: str | None = None
    location: str | None = None
    device: str | None = None
    status: str | None = None

    @model_validator(mode="after")
    def require_name_or_eri(self):
        if self.name is None and self.eri is None and self.status is None and self.location is None and self.device is None:
            raise ValueError("Nada para actualizar")
        if self.name is not None or self.eri is not None:
            name = (self.name or "").strip()
            eri = (self.eri or "").strip()
            # Si envían name/eri, al menos uno debe quedar con valor al actualizar parcial
            # Validación fina se hace en el router con el registro existente
        return self


class PersonOut(BaseModel):
    id: str
    name: str | None
    eri: str | None
    location: str | None
    device: str | None
    status: str
    created_by: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---- Handovers ----

class HandoverCreate(BaseModel):
    summary: str = Field(min_length=1)
    open_events: int = Field(ge=0)
    notes: str | None = None


class HandoverOut(BaseModel):
    id: str
    guard_id: str
    summary: str
    open_events: int
    notes: str | None
    created_by: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---- Dashboard ----

class DashboardOut(BaseModel):
    user: UserOut
    guard: GuardOut | None
    events: list[EventOut]
    people: list[PersonOut]
