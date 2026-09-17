from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Guard, GuardEvent, GuardMember, Person, User, new_id
from app.schemas import (
    DashboardOut,
    EventOut,
    GuardCreate,
    GuardMemberOut,
    GuardOut,
    PersonOut,
    UserOut,
)

router = APIRouter(tags=["dashboard", "guards"])


def serialize_guard(db: Session, guard: Guard) -> GuardOut:
    chief = db.get(User, guard.chief_user_id)
    member_rows = list(
        db.scalars(select(GuardMember).where(GuardMember.guard_id == guard.id))
    )
    user_ids = {row.user_id for row in member_rows}
    users_by_id: dict[str, User] = {}
    if user_ids:
        users_by_id = {
            user.id: user
            for user in db.scalars(select(User).where(User.id.in_(user_ids))).all()
        }

    members: list[GuardMemberOut] = []
    for row in member_rows:
        user = users_by_id.get(row.user_id)
        members.append(
            GuardMemberOut(
                user_id=row.user_id,
                name=user.name if user else "Usuario",
                role=row.role,
            )
        )

    if chief and not any(member.user_id == chief.id for member in members):
        members.insert(
            0,
            GuardMemberOut(
                user_id=chief.id,
                name=chief.name,
                role="Jefe de guardia",
            ),
        )

    return GuardOut(
        id=guard.id,
        date=guard.date,
        start_time=guard.start_time,
        end_time=guard.end_time,
        status=guard.status,
        chief_user_id=guard.chief_user_id,
        chief_name=chief.name if chief else "Sin asignar",
        members=members,
        created_at=guard.created_at,
        updated_at=guard.updated_at,
    )


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    active = db.scalar(
        select(Guard).where(Guard.status == "active").order_by(Guard.created_at.desc())
    )
    # El dashboard recibe el historial completo, incluyendo guardias cerradas.
    # La interfaz filtra los eventos de la guardia activa para el resumen.
    events = list(
        db.scalars(
            select(GuardEvent).order_by(GuardEvent.created_at.desc())
        )
    )
    people = list(db.scalars(select(Person).order_by(Person.created_at.desc())))

    return DashboardOut(
        user=UserOut.model_validate(current_user),
        guard=serialize_guard(db, active) if active else None,
        events=[EventOut.model_validate(e) for e in events],
        people=[PersonOut.model_validate(p) for p in people],
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return list(
        db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name.asc()))
    )


@router.get("/guards/active", response_model=GuardOut | None)
def get_active_guard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    active = db.scalar(
        select(Guard).where(Guard.status == "active").order_by(Guard.created_at.desc())
    )
    return serialize_guard(db, active) if active else None


@router.post("/guards", response_model=GuardOut, status_code=status.HTTP_201_CREATED)
def create_guard(
    payload: GuardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.scalar(select(Guard).where(Guard.status == "active").limit(1))
    if existing:
        return serialize_guard(db, existing)

    guard = Guard(
        id=new_id("guard"),
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status="active",
        chief_user_id=current_user.id,
    )
    db.add(guard)
    db.flush()

    db.add(
        GuardMember(
            id=new_id("member"),
            guard_id=guard.id,
            user_id=current_user.id,
            role="Jefe de guardia",
        )
    )

    seen = {current_user.id}
    for member in payload.members or []:
        if member.user_id in seen:
            continue
        user = db.get(User, member.user_id)
        if not user or not user.is_active:
            continue
        seen.add(member.user_id)
        db.add(
            GuardMember(
                id=new_id("member"),
                guard_id=guard.id,
                user_id=member.user_id,
                role=(member.role or user.role or "Agente").strip() or "Agente",
            )
        )

    db.commit()
    db.refresh(guard)
    return serialize_guard(db, guard)


@router.post("/guards/{guard_id}/finish", response_model=GuardOut)
def finish_guard(
    guard_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    guard = db.get(Guard, guard_id)
    if not guard:
        raise HTTPException(status_code=404, detail="Guardia no encontrada")
    if guard.status == "closed":
        raise HTTPException(status_code=400, detail="La guardia ya está cerrada")

    guard.status = "closed"
    db.commit()
    db.refresh(guard)
    return serialize_guard(db, guard)


@router.get("/guards", response_model=list[GuardOut])
def list_guards(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Guard).order_by(Guard.created_at.desc())
    if status_filter:
        stmt = stmt.where(Guard.status == status_filter)
    guards = list(db.scalars(stmt))
    return [serialize_guard(db, guard) for guard in guards]
