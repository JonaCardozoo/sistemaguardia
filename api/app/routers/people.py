from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Person, User, new_id
from app.schemas import PersonCreate, PersonOut, PersonUpdate

router = APIRouter(prefix="/people", tags=["people"])


@router.get("", response_model=list[PersonOut])
def list_people(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return list(db.scalars(select(Person).order_by(Person.created_at.desc())))


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def create_person(
    payload: PersonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    person = Person(
        id=new_id("person"),
        name=payload.name.strip() if payload.name else None,
        eri=payload.eri.strip() if payload.eri else None,
        location=payload.location.strip() if payload.location else None,
        device=payload.device.strip() if payload.device else None,
        status="ACTIVO",
        created_by=current_user.id,
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.patch("/{person_id}", response_model=PersonOut)
def update_person(
    person_id: str,
    payload: PersonUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    if payload.name is not None:
        person.name = payload.name.strip() or None
    if payload.eri is not None:
        person.eri = payload.eri.strip() or None
    if payload.location is not None:
        person.location = payload.location.strip() or None
    if payload.device is not None:
        person.device = payload.device.strip() or None
    if payload.status is not None:
        person.status = payload.status

    if not person.name and not person.eri:
        raise HTTPException(status_code=400, detail="Se requiere name o eri")

    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(
    person_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    db.delete(person)
    db.commit()
