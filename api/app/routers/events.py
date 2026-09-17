from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Guard, GuardEvent, User, new_id
from app.schemas import EventActionCreate, EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/guards/{guard_id}/events", tags=["events"])


def _get_guard(db: Session, guard_id: str) -> Guard:
    guard = db.get(Guard, guard_id)
    if not guard:
        raise HTTPException(status_code=404, detail="Guardia no encontrada")
    return guard


@router.get("", response_model=list[EventOut])
def list_events(
    guard_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_guard(db, guard_id)
    return list(
        db.scalars(
            select(GuardEvent)
            .where(GuardEvent.guard_id == guard_id)
            .order_by(GuardEvent.created_at.desc())
        )
    )


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    guard_id: str,
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    guard = _get_guard(db, guard_id)
    if guard.status != "active":
        raise HTTPException(status_code=400, detail="La guardia no está activa")

    data = deepcopy(payload.event_data)
    data["operator"] = current_user.name or current_user.email

    event = GuardEvent(id=new_id("event"), guard_id=guard_id, event_data=data)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    guard_id: str,
    event_id: str,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_guard(db, guard_id)
    event = db.scalar(
        select(GuardEvent).where(GuardEvent.id == event_id, GuardEvent.guard_id == guard_id)
    )
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    event.event_data = payload.event_data
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/actions", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def add_action(
    guard_id: str,
    event_id: str,
    payload: EventActionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _get_guard(db, guard_id)
    event = db.scalar(
        select(GuardEvent).where(GuardEvent.id == event_id, GuardEvent.guard_id == guard_id)
    )
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    data = deepcopy(event.event_data) if isinstance(event.event_data, dict) else {}
    actions = data.get("actions")
    if not isinstance(actions, list):
        actions = []
    actions.append(payload.action)
    data["actions"] = actions
    event.event_data = data

    db.commit()
    db.refresh(event)
    return event
