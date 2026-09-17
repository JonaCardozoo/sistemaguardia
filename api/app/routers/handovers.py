from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Guard, GuardHandover, User, new_id
from app.schemas import HandoverCreate, HandoverOut

router = APIRouter(prefix="/guards/{guard_id}/handovers", tags=["handovers"])


@router.get("", response_model=list[HandoverOut])
def list_handovers(
    guard_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    guard = db.get(Guard, guard_id)
    if not guard:
        raise HTTPException(status_code=404, detail="Guardia no encontrada")

    return list(
        db.scalars(
            select(GuardHandover)
            .where(GuardHandover.guard_id == guard_id)
            .order_by(GuardHandover.created_at.desc())
        )
    )


@router.post("", response_model=HandoverOut, status_code=status.HTTP_201_CREATED)
def create_handover(
    guard_id: str,
    payload: HandoverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    guard = db.get(Guard, guard_id)
    if not guard:
        raise HTTPException(status_code=404, detail="Guardia no encontrada")

    handover = GuardHandover(
        id=new_id("handover"),
        guard_id=guard_id,
        summary=payload.summary.strip(),
        open_events=payload.open_events,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(handover)
    db.commit()
    db.refresh(handover)
    return handover
