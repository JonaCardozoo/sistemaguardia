'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from '@/lib/auth-client'
import { api, getToken, mapEvent, mapPerson } from '@/lib/api-client'
import type { ApiGuardMember, ApiUser } from '@/lib/api-client'
import type { ReactNode, FormEvent } from 'react'
import { Activity, AlertTriangle, ArrowLeft, Bell, CalendarDays, Check, ChevronRight, CircleUserRound, ClipboardList, Clock3, Download, FileText, LayoutDashboard, Menu, MonitorSmartphone, Plus, Search, ShieldCheck, Users, X } from 'lucide-react'

type Status = 'Pendiente' | 'En seguimiento' | 'Resuelto'
type View = 'Inicio' | 'Guardia' | 'Relevo' | 'Historial' | 'Personas'
type Person = { id: string; name: string; eri: string; location: string; device: string; status: string }
type Action = { id: number; label: string; time: string; operator: string }
type Event = { id: number; dbId?: string; guardId?: string; createdAt?: string | null; updatedAt?: string | null; personId?: string; time: string; type: string; eri: string; person: string; location: string; device: string; status: Status; lastAction: string; operator: string; bodyDetection?: string; communication?: string; statement?: string; actions: Action[]; generatedText: string; notes?: string }
type GuardMember = ApiGuardMember

const people: Person[] = []
const eventTypes = ['Apertura o corte del transmisor', 'Sin comunicación celular', 'Sin comunicación GPS', 'Batería', 'Salida de zona', 'Ingreso a zona', 'Otro']
const actionOptions = ['Se realizó llamada telefónica', 'Se solicitó fotografía del dispositivo', 'Se brindaron indicaciones', 'Se indicó colocar cinta en el sector afectado', 'Se comunicó a dependencia policial', 'Se solicitó verificación policial', 'Se informó al supervisor', 'Otra actuación']
const navItems: { label: View; icon: typeof LayoutDashboard }[] = [{ label: 'Inicio', icon: LayoutDashboard }, { label: 'Guardia', icon: ShieldCheck }, { label: 'Relevo', icon: ClipboardList }, { label: 'Historial', icon: FileText }, { label: 'Personas', icon: Users }]

function argentinaDateLabel(date = new Date()) { return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date) }
function argentinaDateInput() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function roleLabel(role: string) {
  const key = role.trim().toLowerCase()
  if (key === 'jefe' || key === 'jefe_de_guardia' || key === 'jefe de guardia') return 'Jefe de guardia'
  if (key === 'operador') return 'Operador'
  if (key === 'agente') return 'Agente'
  return role.trim() || 'Agente'
}
function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function makeText(type: string, person: Person, body: string, communication: string, statement: string, actions: string[], notes: string) {
  const details = type === 'Apertura o corte del transmisor' ? ` ${type.toUpperCase()} (${body || 'no verificado'}).` : ` El ${person.device} se encuentra ${type.toUpperCase()}.`
  return `${person.name} (${person.eri}) - ${person.location} -${details} ${communication ? `Comunicación: ${communication.toLowerCase()}.` : ''} ${statement ? `Manifiesta: ${statement}` : ''} ${actions.length ? `${actions.join('. ')}.` : ''} ${notes}`.replace(/\s+/g, ' ').trim()
}

function eventMatchesPerson(event: Event, person: Person, previous?: Person) {
  if (event.personId && (event.personId === person.id || (previous && event.personId === previous.id))) return true
  const name = previous?.name ?? person.name
  const eri = previous?.eri ?? person.eri
  if (event.person === name && event.eri === eri) return true
  return Boolean(eri && eri !== 'Sin ERI' && event.eri === eri)
}

function applyPersonToEvent(event: Event, person: Person): Event {
  let generatedText = event.generatedText || ''
  if (event.location && person.location && generatedText.includes(event.location)) {
    generatedText = generatedText.replaceAll(event.location, person.location)
  }
  if (event.device && person.device && generatedText.includes(event.device)) {
    generatedText = generatedText.replaceAll(event.device, person.device)
  }
  if (event.person && event.eri) {
    generatedText = generatedText.replaceAll(`${event.person} (${event.eri})`, `${person.name} (${person.eri})`)
  }
  return {
    ...event,
    personId: person.id,
    person: person.name,
    eri: person.eri,
    location: person.location,
    device: person.device,
    generatedText,
  }
}

function enrichEvent(event: Event, peopleList: Person[]): Event {
  const person = peopleList.find((item) => item.id === event.personId)
    || peopleList.find((item) => item.name === event.person && item.eri === event.eri)
    || (event.eri && event.eri !== 'Sin ERI' ? peopleList.find((item) => item.eri === event.eri) : undefined)
  return person ? applyPersonToEvent(event, person) : event
}

const initialEvents: Event[] = []

function StatusBadge({ status }: { status: Status }) { return <span className={`status-badge status-${status.toLowerCase().replace(' ', '-')}`}><span className="status-dot" />{status}</span> }

export default function DashboardClient() {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = useSession()
  const [booting, setBooting] = useState(true)
  const [peopleState, setPeopleState] = useState<Person[]>(people)
  const [view, setView] = useState<View>('Inicio')
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [activeGuardId, setActiveGuardId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'Todos' | Status>('Todos')
  const [query, setQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [modalStep, setModalStep] = useState(0)
  const [selectedType, setSelectedType] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [personQuery, setPersonQuery] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [guardClosed, setGuardClosed] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [guardDate, setGuardDate] = useState(argentinaDateInput())
  const [guardStart, setGuardStart] = useState('19:00')
  const [guardEnd, setGuardEnd] = useState('07:00')
  const [guardSaved, setGuardSaved] = useState(false)
  const [chiefName, setChiefName] = useState('')
  const [guardTeam, setGuardTeam] = useState<GuardMember[]>([])

  const operatorName = session?.user?.name || session?.user?.email || 'Operador'
  const operatorInitials = initials(operatorName)
  const operatorId = session?.user?.id || ''
  const guardHours = activeGuardId ? `${guardStart} a ${guardEnd} hs` : ''

  useEffect(() => {
    if (sessionPending) return
    if (!getToken() || !session?.user) {
      router.replace('/sign-in')
      return
    }

    let cancelled = false
    async function load() {
      try {
        const data = await api.dashboard()
        if (cancelled) return
        setActiveGuardId(data.guard?.id ?? null)
        setGuardSaved(Boolean(data.guard?.id))
        if (data.guard) {
          setGuardDate(data.guard.date)
          setGuardStart(data.guard.start_time)
          setGuardEnd(data.guard.end_time)
          setChiefName(data.guard.chief_name || '')
          setGuardTeam(data.guard.members || [])
        } else {
          setChiefName('')
          setGuardTeam([])
        }
        setEvents(data.events.map((row) => mapEvent(row) as Event))
        setPeopleState(data.people.map(mapPerson))
      } catch {
        if (!cancelled) router.replace('/sign-in')
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionPending, session?.user, router])

  const liveEvents = useMemo(() => events.map((event) => enrichEvent(event, peopleState)), [events, peopleState])
  const currentGuardEvents = useMemo(() => activeGuardId ? liveEvents.filter((event) => event.guardId === activeGuardId) : [], [activeGuardId, liveEvents])
  const filtered = useMemo(() => currentGuardEvents.filter((e) => (filter === 'Todos' || e.status === filter) && `${e.eri} ${e.person} ${e.device} ${e.location} ${e.type}`.toLowerCase().includes(query.toLowerCase())), [currentGuardEvents, filter, query])
  const visibleEvents = filtered
  const counts = { Pendiente: currentGuardEvents.filter((e) => e.status === 'Pendiente').length, 'En seguimiento': currentGuardEvents.filter((e) => e.status === 'En seguimiento').length, Resuelto: currentGuardEvents.filter((e) => e.status === 'Resuelto').length }
  const activePeople = peopleState.filter((p) => `${p.name} ${p.eri} ${p.device} ${p.location}`.toLowerCase().includes(personQuery.toLowerCase()) && p.status === 'ACTIVO')
  const selectedEventView = selectedEvent ? enrichEvent(selectedEvent, peopleState) : null

  function persistEventPerson(nextEvent: Event) {
    if (activeGuardId && nextEvent.dbId) void api.updateEvent(activeGuardId, nextEvent.dbId, nextEvent)
  }

  function handlePeopleChange(nextPeople: Person[], changed?: { previous?: Person; updated: Person }) {
    setPeopleState(nextPeople)
    if (!changed) return
    setEvents((current) => current.map((event) => {
      if (!eventMatchesPerson(event, changed.updated, changed.previous)) return event
      const nextEvent = applyPersonToEvent(event, changed.updated)
      persistEventPerson(nextEvent)
      return nextEvent
    }))
    setSelectedEvent((current) => {
      if (!current || !eventMatchesPerson(current, changed.updated, changed.previous)) return current
      return applyPersonToEvent(current, changed.updated)
    })
  }

  async function createPersonFromWizard(input: { name: string; eri: string; location: string; device: string }) {
    const created = mapPerson(await api.createPerson(input))
    setPeopleState((current) => [created, ...current.filter((item) => item.id !== created.id)])
    setSelectedPerson(created)
    setPersonQuery('')
    return created
  }

  async function createEvent(data: Partial<Event>) {
    if (!activeGuardId) {
      window.alert('Para registrar un evento primero iniciá la guardia en la sección Guardia.')
      setModalStep(0)
      setView('Guardia')
      return
    }
    if (!selectedType || !selectedPerson) return

    const event: Event = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      type: selectedType,
      personId: selectedPerson.id,
      eri: selectedPerson.eri,
      person: selectedPerson.name,
      location: selectedPerson.location,
      device: selectedPerson.device,
      status: 'Pendiente',
      lastAction: data.actions?.length ? data.actions[data.actions.length - 1].label : 'Evento registrado',
      operator: operatorName,
      bodyDetection: data.bodyDetection,
      communication: data.communication,
      statement: data.statement,
      notes: data.notes,
      actions: data.actions || [],
      generatedText: data.generatedText || '',
    }

    try {
      const row = await api.createEvent(activeGuardId, event)
      const saved = mapEvent(row) as Event
      setEvents((current) => [{ ...event, ...saved, id: event.id, dbId: row.id }, ...current])
      setModalStep(0)
      setSelectedType('')
      setSelectedPerson(null)
      setPersonQuery('')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar el evento')
    }
  }

  function openNewEvent() {
    if (!activeGuardId) {
      window.alert('Para registrar un evento primero iniciá la guardia en la sección Guardia.')
      setView('Guardia')
      return
    }
    setModalStep(1)
  }

  function changeStatus(status: Status) {
    if (!selectedEvent) return
    const current = enrichEvent(selectedEvent, peopleState)
    const updated = { ...current, status, lastAction: status === 'Resuelto' ? 'Evento resuelto' : 'Estado actualizado' }
    setEvents((currentEvents) => currentEvents.map((e) => (e.id === updated.id ? updated : e)))
    if (activeGuardId && updated.dbId) void api.updateEvent(activeGuardId, updated.dbId, updated)
    setSelectedEvent(updated)
  }

  function addAction(action: Action) {
    if (!selectedEvent) return
    const current = enrichEvent(selectedEvent, peopleState)
    const updated = { ...current, actions: [...current.actions, action], lastAction: action.label }
    setEvents((currentEvents) => currentEvents.map((e) => (e.id === updated.id ? updated : e)))
    setSelectedEvent(updated)
    if (activeGuardId && updated.dbId) void api.addEventAction(activeGuardId, updated.dbId, action)
  }

  const title = view === 'Inicio' ? 'Resumen de guardia' : view

  if (sessionPending || booting) {
    return <div className="app-shell"><main className="main-content"><div className="page-container"><p>Cargando…</p></div></main></div>
  }

  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="brand"><div className="brand-mark"><Activity /></div><div><strong>LIBRO DE GUARDIA</strong><span>Centro de monitoreo</span></div><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Cerrar menú"><X /></button></div><div className="guard-status"><span className={activeGuardId ? 'online-dot' : 'offline-dot'} /><div><small>{activeGuardId ? 'GUARDIA ACTIVA' : 'SIN GUARDIA ACTIVA'}</small><strong>{activeGuardId ? `${guardStart} a ${guardEnd} hs` : 'Iniciar cuando corresponda'}</strong></div><ChevronRight /></div><nav className="main-nav" aria-label="Navegación principal">{navItems.map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'nav-item active' : 'nav-item'} onClick={() => { setView(label); setSelectedEvent(null); setMobileNav(false) }}><Icon /><span>{label}</span>{label === 'Relevo' && counts.Pendiente + counts['En seguimiento'] > 0 && <em>{counts.Pendiente + counts['En seguimiento']}</em>}</button>)}</nav><div className="sidebar-footer"><div className="operator"><div className="avatar">{operatorInitials}</div><div><strong>{operatorName}</strong><span>Operador</span></div><ChevronRight /></div><div className="secure-note"><ShieldCheck /> Sesión protegida</div><button className="logout-button" onClick={() => signOut()}>Cerrar sesión</button></div></aside><main className="main-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menú"><Menu /></button><div className="breadcrumb"><span>Libro de Guardia</span><ChevronRight /><strong>{title}</strong></div><div className="top-actions"><span className="live-indicator"><span className="online-dot" /> Sistema operativo</span><div className="notification-wrap"><button className="icon-button" aria-label="Notificaciones" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Bell /><span className="notification-dot" /></button>{notificationsOpen && <div className="notification-panel"><div className="notification-panel-header"><strong>Notificaciones</strong><span>{counts.Pendiente + counts['En seguimiento']} activas</span></div><button className="notification-item" onClick={() => { setView('Relevo'); setNotificationsOpen(false) }}><span className="notification-icon"><AlertTriangle /></span><span><strong>{counts.Pendiente} eventos pendientes</strong><small>Revisá las novedades sin resolver</small></span><ChevronRight /></button><button className="notification-item" onClick={() => { setView('Guardia'); setNotificationsOpen(false) }}><span className="notification-icon"><Clock3 /></span><span><strong>Guardia en curso</strong><small>{guardStart} — {guardEnd}</small></span><ChevronRight /></button></div>}</div><div className="profile-wrap"><button className="top-profile-button" aria-label="Abrir menú de perfil" aria-expanded={profileOpen} onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false) }}><div className="top-avatar">{operatorInitials}</div><span>{operatorName}</span><ChevronRight /></button>{profileOpen && <div className="profile-menu"><strong>{operatorName}</strong><span>{session?.user?.email || 'Operador'}</span><button onClick={() => signOut()}>Cerrar sesión</button></div>}</div></div></header><div className="page-container">{selectedEventView ? <EventDetail event={selectedEventView} onBack={() => setSelectedEvent(null)} onStatus={changeStatus} onAddAction={addAction} /> : view === 'Personas' ? <PeopleView people={peopleState} onPeopleChange={handlePeopleChange} /> : view === 'Guardia' ? <GuardView events={liveEvents} activeGuardId={activeGuardId} initialDate={guardDate} initialStart={guardStart} initialEnd={guardEnd} chiefName={chiefName} team={guardTeam} currentUserId={operatorId} currentUserName={operatorName} onStarted={(id, guard) => { setActiveGuardId(id); setEvents([]); setGuardDate(guard.date); setGuardStart(guard.startTime); setGuardEnd(guard.endTime); setChiefName(guard.chiefName); setGuardTeam(guard.members); setGuardSaved(true); setGuardClosed(false) }} closed={guardClosed} summaryOpen={summaryOpen} onClose={() => { if (activeGuardId) { void api.finishGuard(activeGuardId); setActiveGuardId(null); setGuardClosed(true); setGuardSaved(false); setEvents([]); setChiefName(''); setGuardTeam([]) } }} onSummary={() => { setSummaryOpen(true); if (activeGuardId) void api.createHandover(activeGuardId, { summary: events.filter((event) => event.status !== 'Resuelto').map((event) => event.generatedText).join(' ') || 'Sin novedades abiertas', openEvents: events.filter((event) => event.status !== 'Resuelto').length }) }} onSummaryClose={() => setSummaryOpen(false)} /> : view === 'Relevo' ? <HandoffView events={liveEvents} onSelect={setSelectedEvent} /> : view === 'Historial' ? <HistoryView events={liveEvents} onSelect={setSelectedEvent} /> : <Dashboard events={visibleEvents} counts={counts} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onSelect={setSelectedEvent} onNew={openNewEvent} activeGuardId={activeGuardId} guardHours={guardHours} guardDate={guardDate} chiefName={chiefName} />}</div></main>{modalStep > 0 && <EventWizard step={modalStep} type={selectedType} person={selectedPerson} people={activePeople} query={personQuery} setQuery={setPersonQuery} operatorName={operatorName} onType={(type: string) => { setSelectedType(type); setModalStep(2) }} onPerson={setSelectedPerson} onCreatePerson={createPersonFromWizard} onBack={() => setModalStep((current) => Math.max(1, current - 1))} onContinue={() => setModalStep(3)} onClose={() => setModalStep(0)} onCreate={createEvent} />}</div>
}

function Dashboard({ events, counts, query, setQuery, filter, setFilter, onSelect, onNew, activeGuardId, guardHours, guardDate, chiefName }: any) {
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> {argentinaDateLabel().toUpperCase()}</div>
        <h1>Resumen de guardia</h1>
        <p>Supervisá las novedades y el estado de los eventos de tu turno.</p>
      </div>
      <button className="primary-button" onClick={onNew}><Plus /> NUEVO EVENTO</button>
    </div>
    {activeGuardId ? (
      <section className="guard-card">
        <div className="guard-card-icon"><Clock3 /></div>
        <div className="guard-card-main"><span>GUARDIA ACTUAL</span><strong>Guardia en curso</strong></div>
        <div className="guard-meta"><span>HORARIO</span><strong>{guardHours}</strong></div>
        <div className="guard-meta"><span>FECHA</span><strong>{argentinaDateLabel(new Date(`${guardDate}T12:00:00`))}</strong></div>
        <div className="guard-meta operator-meta"><span>JEFE DE GUARDIA</span><strong>{chiefName || 'Sin asignar'}</strong></div>
      </section>
    ) : (
      <section className="guard-card guard-card-empty">
        <div className="guard-card-icon"><ShieldCheck /></div>
        <div className="guard-card-main"><span>GUARDIA ACTUAL</span><strong>No hay guardia actual</strong></div>
        <div className="guard-meta"><span>ESTADO</span><strong>Sin iniciar</strong></div>
      </section>
    )}
    <section className="metrics-grid">{([['Pendientes', counts.Pendiente, 'metric-red', AlertTriangle], ['En seguimiento', counts['En seguimiento'], 'metric-amber', Activity], ['Resueltos', counts.Resuelto, 'metric-green', Check], ['Total de eventos', events.length, 'metric-neutral', ClipboardList]] as const).map(([label, value, color, Icon]) => <div className="metric-card" key={label}><div className={`metric-icon ${color}`}><Icon /></div><div><span>{label}</span><strong>{value}</strong></div></div>)}</section>
    <section className="events-section">
      <div className="section-heading"><div><h2>Eventos recientes</h2><p>Últimas novedades registradas en esta guardia</p></div></div>
      <div className="table-toolbar">
        <div className="search-box"><Search /><input aria-label="Buscar eventos" placeholder="Buscar por ERI, persona, dispositivo..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="filter-tabs">{(['Todos', 'Pendiente', 'En seguimiento', 'Resuelto'] as const).map((item) => <button key={item} className={filter === item ? 'filter-tab active' : 'filter-tab'} onClick={() => setFilter(item)}>{item}{item !== 'Todos' && <b>{counts[item]}</b>}</button>)}</div>
      </div>
      <EventTable events={events} onSelect={onSelect} />
    </section>
  </>
}

function EventTable({ events, onSelect }: { events: Event[]; onSelect: (event: Event) => void }) { return <div className="table-wrap"><table><thead><tr><th>HORA</th><th>TIPO DE EVENTO</th><th>ERI / PERSONA</th><th>LOCALIDAD</th><th>DISPOSITIVO</th><th>ESTADO</th><th>ÚLTIMA ACTUACIÓN</th><th>OPERADOR</th><th /></tr></thead><tbody>{events.map((event) => <tr key={event.id} onClick={() => onSelect(event)}><td className="time-cell">{event.time}</td><td><span className="event-type"><span className="event-type-mark" />{event.type}</span></td><td><strong>{event.eri}</strong><span className="cell-subtitle">{event.person}</span></td><td>{event.location}</td><td className="device-cell"><MonitorSmartphone />{event.device}</td><td><StatusBadge status={event.status} /></td><td className="muted-cell">{event.lastAction}</td><td className="muted-cell">{event.operator}</td><td><ChevronRight className="row-chevron" /></td></tr>)}</tbody></table>{!events.length && <div className="empty-state"><Search /><strong>No encontramos eventos</strong><span>Probá con otra búsqueda o filtro.</span></div>}</div> }

function EventWizard({ step, type, person, people, query, setQuery, operatorName, onType, onPerson, onCreatePerson, onBack, onContinue, onClose, onCreate }: any) {
  const [body, setBody] = useState('')
  const [communication, setCommunication] = useState('')
  const [statement, setStatement] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)
  const [creatingPerson, setCreatingPerson] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEri, setNewEri] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newDevice, setNewDevice] = useState('')
  const generated = person ? makeText(type, person, body, communication, statement, selectedActions, notes) : ''
  const toggle = (action: string) => setSelectedActions((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action])
  const visiblePeople = person && !people.some((item: Person) => item.id === person.id) ? [person, ...people] : people

  async function submitNewPerson() {
    if (!newName.trim() && !newEri.trim()) {
      window.alert('Ingresá un nombre o un ERI')
      return
    }
    if (creatingPerson) return
    setCreatingPerson(true)
    try {
      await onCreatePerson({ name: newName, eri: newEri, location: newLocation, device: newDevice })
      setAddingPerson(false)
      setNewName('')
      setNewEri('')
      setNewLocation('')
      setNewDevice('')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear la persona')
    } finally {
      setCreatingPerson(false)
    }
  }

  async function handleSave() {
    if (!person || saving) return
    setSaving(true)
    try {
      await onCreate({
        bodyDetection: body || undefined,
        communication: communication || undefined,
        statement: statement || undefined,
        notes: notes || undefined,
        actions: selectedActions.map((label, index) => ({
          id: Date.now() + index,
          label,
          time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          operator: operatorName || 'Operador',
        })),
        generatedText: generated,
      })
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="event-modal phase-two-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">NUEVA NOVEDAD <span className="step-count">PASO {step} DE 3</span></span><h2>{step === 1 ? '¿Qué tipo de evento ocurrió?' : step === 2 ? 'Seleccioná la persona o dispositivo' : 'Completá el registro'}</h2><p>{step === 3 ? 'Las actuaciones seleccionadas se incorporan a la redacción sin inventar información.' : 'La información se completa desde la base local autorizada.'}</p></div><button className="close-button" onClick={onClose} aria-label="Cerrar"><X /></button></div>{step === 1 ? <div className="type-grid">{eventTypes.map((item, index) => <button key={item} className="type-option" onClick={() => onType(item)}><span className="type-number">{index + 1}</span><span>{item}</span><ChevronRight /></button>)}</div> : step === 2 ? <><div className="search-box modal-search"><Search /><input autoFocus placeholder="Buscar por ERI, nombre o dispositivo..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><button className="add-person-inline" type="button" onClick={() => setAddingPerson((open) => !open)}>+ Agregar persona nueva</button>{addingPerson && <form className="person-form wizard-person-form" onSubmit={(event) => { event.preventDefault(); void submitNewPerson() }}><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" autoFocus /><input value={newEri} onChange={(e) => setNewEri(e.target.value)} placeholder="ERI" /><input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Localidad" /><input value={newDevice} onChange={(e) => setNewDevice(e.target.value)} placeholder="Dispositivo" /><button className="primary-button" type="submit" disabled={creatingPerson}>{creatingPerson ? 'Guardando…' : 'Crear y seleccionar'}</button></form>}<div className="person-results">{visiblePeople.map((item: Person) => <button key={item.id} className={`person-option ${person?.id === item.id ? 'selected' : ''}`} onClick={() => onPerson(item)}><div className="person-icon"><CircleUserRound /></div><div><strong>{item.name}</strong><span>ERI {item.eri} · {item.location}</span></div><span className="device-label">{item.device}</span>{person?.id === item.id && <Check />}</button>)}</div><div className="modal-footer"><button className="secondary-button" onClick={onBack}><ArrowLeft /> Atrás</button><button className="primary-button" disabled={!person} onClick={onContinue}>Continuar <ChevronRight /></button></div></> : <div className="wizard-details"><div className="selected-person-summary"><strong>{person?.name}</strong><span>ERI {person?.eri} · {person?.location} · {person?.device}</span></div>{type === 'Apertura o corte del transmisor' && <Field label="Detección de cuerpo"><select value={body} onChange={(e) => setBody(e.target.value)}><option value="">Seleccionar</option><option>Sí</option><option>No</option><option>No verificado</option></select></Field>}<Field label="¿Se estableció comunicación?"><select value={communication} onChange={(e) => setCommunication(e.target.value)}><option value="">Seleccionar</option><option>Sí</option><option>No</option><option>No corresponde</option></select></Field>{communication === 'Sí' && <Field label="Manifestación de la persona"><textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Escribí la manifestación, sin agregar datos no informados." /></Field>}<fieldset><legend>Actuaciones realizadas</legend><div className="action-checks">{actionOptions.map((action) => <label key={action}><input type="checkbox" checked={selectedActions.includes(action)} onChange={() => toggle(action)} />{action}</label>)}</div></fieldset><Field label="Observación"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observación opcional" /></Field><div className="preview-box"><div><span>VISTA PREVIA DE LA NOVEDAD</span><button className="text-button" onClick={() => navigator.clipboard?.writeText(generated)}>Copiar</button></div><p>{generated || 'Completá los datos para generar la redacción.'}</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => onBack()} disabled={saving}><ArrowLeft /> Atrás</button><button className="primary-button" disabled={!person || saving} onClick={() => void handleSave()}>{saving ? 'Guardando…' : 'Guardar evento'} {!saving && <Check />}</button></div></div>}</div></div>
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="wizard-field"><span>{label}</span>{children}</label> }

function EventDetail({ event, onBack, onStatus, onAddAction }: { event: Event; onBack: () => void; onStatus: (status: Status) => void; onAddAction: (action: Action) => void }) { const [newAction, setNewAction] = useState(''); return <div className="detail-view"><button className="back-button" onClick={onBack}><ArrowLeft /> Volver a eventos</button><div className="page-heading detail-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> DETALLE DE NOVEDAD · {event.time} HS</div><h1>{event.type}</h1><p>Evento #{String(event.id).slice(-4)} · Registrado por {event.operator}</p></div><StatusBadge status={event.status} /></div><div className="detail-grid"><div className="detail-main"><section className="detail-card"><div className="card-title"><h2>Datos del evento</h2><span>Información de la base local</span></div><div className="detail-fields"><div><span>PERSONA</span><strong>{event.person}</strong></div><div><span>ERI</span><strong>{event.eri}</strong></div><div><span>LOCALIDAD</span><strong>{event.location}</strong></div><div><span>DISPOSITIVO</span><strong>{event.device}</strong></div></div></section><section className="detail-card"><div className="card-title"><h2>Línea de tiempo</h2><span>{event.actions.length + 1} registros</span></div><div className="timeline"><div className="timeline-item"><span>{event.time}</span><div className="timeline-dot active" /><div><strong>Evento registrado</strong><p>Se creó la novedad en el sistema</p></div></div>{event.actions.map((action) => <div className="timeline-item" key={action.id}><span>{action.time}</span><div className="timeline-dot" /><div><strong>{action.label}</strong><p>Realizado por {action.operator}</p></div></div>)}</div></section><section className="detail-card generated-card"><div className="card-title"><h2>Redacción de la novedad</h2><span>Texto generado y editable en la próxima revisión</span></div><p>{event.generatedText}</p></section></div><aside className="detail-side"><section className="detail-card status-card"><div className="card-title"><h2>Estado del evento</h2></div><div className="status-actions">{(['Pendiente', 'En seguimiento', 'Resuelto'] as Status[]).map((status) => <button key={status} className={event.status === status ? 'selected-status' : ''} onClick={() => onStatus(status)}><StatusBadge status={status} /></button>)}</div></section><section className="detail-card action-card"><div className="card-title"><h2>Agregar actuación</h2></div><select value={newAction} onChange={(e) => setNewAction(e.target.value)}><option value="">Seleccionar actuación</option>{actionOptions.map((action) => <option key={action}>{action}</option>)}</select><button className="primary-button full-width" disabled={!newAction} onClick={() => { onAddAction({ id: Date.now(), label: newAction, time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), operator: event.operator || 'Operador' }); setNewAction('') }}>AGREGAR ACTUACIÓN</button></section></aside></div></div> }

function GuardView({
  events,
  activeGuardId,
  initialDate,
  initialStart,
  initialEnd,
  chiefName,
  team,
  currentUserId,
  currentUserName,
  onStarted,
  closed,
  summaryOpen,
  onClose,
  onSummary,
  onSummaryClose,
}: {
  events: Event[]
  activeGuardId: string | null
  initialDate: string
  initialStart: string
  initialEnd: string
  chiefName: string
  team: GuardMember[]
  currentUserId: string
  currentUserName: string
  onStarted: (id: string, guard: { date: string; startTime: string; endTime: string; chiefName: string; members: GuardMember[] }) => void
  closed: boolean
  summaryOpen: boolean
  onClose: () => void
  onSummary: () => void
  onSummaryClose: () => void
}) {
  const open = events.filter((e) => e.status !== 'Resuelto')
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(initialEnd)
  const [saved, setSaved] = useState(Boolean(activeGuardId))
  const [users, setUsers] = useState<ApiUser[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    setSaved(Boolean(activeGuardId))
  }, [activeGuardId])

  useEffect(() => {
    if (activeGuardId) return
    let cancelled = false
    async function loadUsers() {
      try {
        const rows = await api.listUsers()
        if (cancelled) return
        setUsers(rows)
        setSelectedIds(rows.filter((user) => user.id !== currentUserId).map((user) => user.id))
      } catch {
        if (!cancelled) setUsers([])
      }
    }
    void loadUsers()
    return () => {
      cancelled = true
    }
  }, [activeGuardId, currentUserId])

  function toggleMember(userId: string) {
    setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId])
  }

  async function saveCurrentGuard() {
    if (starting || saved) return
    setStarting(true)
    try {
      const members = users
        .filter((user) => selectedIds.includes(user.id) && user.id !== currentUserId)
        .map((user) => ({ user_id: user.id, role: roleLabel(user.role) }))
      const result = await api.createGuard({ date, startTime, endTime, members })
      setSaved(true)
      onStarted(result.id, {
        date: result.date,
        startTime: result.start_time,
        endTime: result.end_time,
        chiefName: result.chief_name,
        members: result.members || [],
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo iniciar la guardia')
    } finally {
      setStarting(false)
    }
  }

  const availableStaff = users.filter((user) => user.id !== currentUserId)
  const activeTeam = team.length
    ? team
    : [{ user_id: currentUserId, name: chiefName || currentUserName, role: 'Jefe de guardia' }]

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> OPERACIÓN</div>
        <h1>Guardia</h1>
        <p>Estado y seguimiento del turno actual.</p>
      </div>
      <div className="guard-actions">
        <button className="secondary-button" onClick={onSummary} disabled={!activeGuardId}><FileText /> GENERAR RESUMEN</button>
        <button className="primary-button" onClick={onClose} disabled={closed || !activeGuardId}><Clock3 /> {closed ? 'GUARDIA FINALIZADA' : 'FINALIZAR GUARDIA'}</button>
      </div>
    </div>

    {!activeGuardId && (
      <section className="guard-setup-card">
        <div>
          <span className="eyebrow">CONFIGURAR GUARDIA</span>
          <h2>Elegí el día, horario y personal</h2>
          <p>Quien inicia queda como jefe de guardia. Seleccioná los agentes u operadores presentes.</p>
        </div>
        <div className="guard-setup-fields">
          <label>Fecha<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSaved(false) }} /></label>
          <label>Desde<input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setSaved(false) }} /></label>
          <label>Hasta<input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); setSaved(false) }} /></label>
          <button className="primary-button" disabled={starting} onClick={() => void saveCurrentGuard()}>{starting ? 'INICIANDO…' : 'INICIAR GUARDIA'}</button>
        </div>
        <div className="guard-team-picker">
          <div className="guard-team-member selected locked">
            <span className="team-avatar">{initials(currentUserName)}</span>
            <div><strong>{currentUserName}</strong><span>Jefe de guardia</span></div>
            <em>Vos</em>
          </div>
          {availableStaff.length ? availableStaff.map((user) => {
            const selected = selectedIds.includes(user.id)
            return (
              <label key={user.id} className={`guard-team-member ${selected ? 'selected' : ''}`}>
                <input type="checkbox" checked={selected} onChange={() => toggleMember(user.id)} />
                <span className="team-avatar">{initials(user.name)}</span>
                <div><strong>{user.name}</strong><span>{roleLabel(user.role)}</span></div>
              </label>
            )
          }) : (
            <p className="guard-team-empty-hint">No hay otros usuarios registrados. La guardia se iniciará solo con vos como jefe.</p>
          )}
        </div>
      </section>
    )}

    {activeGuardId ? (
      <section className="guard-large-card">
        <div className="guard-large-top">
          <div className="guard-card-icon"><ShieldCheck /></div>
          <div>
            <span>GUARDIA ACTUAL</span>
            <h2>Turno en curso <em>ACTIVA</em></h2>
            <p>{argentinaDateLabel(new Date(`${date}T12:00:00`))} · {startTime} a {endTime} hs</p>
          </div>
        </div>
        <div className="guard-large-stats">
          <div><span>JEFE DE GUARDIA</span><strong>{chiefName || currentUserName}</strong></div>
          <div><span>EVENTOS REGISTRADOS</span><strong>{events.length}</strong></div>
          <div><span>ABIERTOS</span><strong>{open.length}</strong></div>
        </div>
        <div className="guard-team">
          <div className="guard-team-heading"><Users /> <span>PERSONAL PRESENTE EN LA GUARDIA</span></div>
          <div className="guard-team-list">
            {activeTeam.map((member) => (
              <div className="guard-team-member" key={`${member.user_id}-${member.role}`}>
                <span className="team-avatar">{initials(member.name)}</span>
                <div><strong>{member.name}</strong><span>{roleLabel(member.role)}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ) : (
      <section className="guard-large-card guard-card-empty">
        <div className="guard-large-top">
          <div className="guard-card-icon"><ShieldCheck /></div>
          <div>
            <span>GUARDIA ACTUAL</span>
            <h2>No hay guardia actual</h2>
            <p>Configurá fecha, horario y personal, y tocá Iniciar Guardia.</p>
          </div>
        </div>
      </section>
    )}

    {activeGuardId && (
      <div className="notice">
        <AlertTriangle />
        <div>
          <strong>Hay {open.length} eventos sin resolver</strong>
          <span>Revisalos antes de finalizar la guardia para facilitar el relevo.</span>
        </div>
      </div>
    )}

    {summaryOpen && (
      <SummaryModal
        events={events}
        onClose={onSummaryClose}
        chiefName={chiefName || currentUserName}
        team={activeTeam}
        guardHours={`${startTime} a ${endTime} hs`}
        guardDate={date}
      />
    )}
  </>
}

function SummaryModal({
  events,
  onClose,
  chiefName,
  team,
  guardHours,
  guardDate,
}: {
  events: Event[]
  onClose: () => void
  chiefName: string
  team: GuardMember[]
  guardHours: string
  guardDate: string
}) {
  const open = events.filter((event) => event.status !== 'Resuelto')
  const text = `ACTA / RESUMEN DE GUARDIA\n\nFecha: ${argentinaDateLabel(new Date(`${guardDate}T12:00:00`))}\nHorario: ${guardHours}\nJefe de guardia: ${chiefName}\nPersonal: ${team.map((member) => `${member.name} (${roleLabel(member.role)})`).join(', ')}\n\nNOVEDADES\n${[...events].sort((a, b) => a.time.localeCompare(b.time)).map((event) => `${event.time} — ${event.generatedText || `${event.type} — ${event.person} (${event.eri})`}`).join('\n') || 'Sin novedades.'}\n\nPENDIENTES AL FINALIZAR\n${open.length ? open.map((event) => `• ${event.person} (${event.eri}) — ${event.status}`).join('\n') : 'Sin eventos pendientes.'}`

  function copySummary() {
    void navigator.clipboard?.writeText(text)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="event-modal summary-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">CIERRE DE GUARDIA</span>
            <h2>Resumen de guardia</h2>
            <p>Revisá las novedades antes de compartir o imprimir este resumen.</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Cerrar"><X /></button>
        </div>
        <div className="summary-content">
          <div className="summary-meta">
            <div><span>FECHA</span><strong>{argentinaDateLabel(new Date(`${guardDate}T12:00:00`))}</strong></div>
            <div><span>HORARIO</span><strong>{guardHours}</strong></div>
            <div><span>JEFE DE GUARDIA</span><strong>{chiefName}</strong></div>
          </div>
          <div className="summary-text">{text}</div>
          {open.length > 0 && (
            <div className="summary-pending">
              <h3>PENDIENTES AL FINALIZAR</h3>
              <ul>{open.map((event) => <li key={event.id}>{event.person} · ERI {event.eri} · {event.status}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="summary-footer">
          <button className="ghost-button" onClick={copySummary}><ClipboardList /> COPIAR TEXTO</button>
          <button className="ghost-button" onClick={() => window.print()}><FileText /> IMPRIMIR</button>
          <button className="secondary-button" onClick={onClose}>CERRAR</button>
        </div>
      </div>
    </div>
  )
}

function HandoffView({ events, onSelect }: { events: Event[]; onSelect: (event: Event) => void }) { const open = events.filter((e) => e.status !== 'Resuelto'); return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> CONTINUIDAD OPERATIVA</div><h1>Relevo</h1><p>Información clave para la guardia entrante.</p></div><div className="handoff-count"><strong>{open.length}</strong><span>eventos abiertos</span></div></div><section className="events-section"><div className="section-heading"><div><h2>Eventos pendientes</h2><p>Requieren seguimiento en la próxima guardia</p></div></div><EventTable events={open} onSelect={onSelect} /></section></> }
function HistoryView({ events, onSelect }: { events: Event[]; onSelect: (event: Event) => void }) { const [query, setQuery] = useState(''); const [status, setStatus] = useState<'Todos' | Status>('Todos'); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState(''); const [page, setPage] = useState(1); const pageSize = 30; const filtered = events.filter((event) => { const eventDate = event.createdAt ? event.createdAt.slice(0, 10) : ''; return (status === 'Todos' || event.status === status) && (!fromDate || eventDate >= fromDate) && (!toDate || eventDate <= toDate) && `${event.type} ${event.person} ${event.eri} ${event.location} ${event.device}`.toLowerCase().includes(query.toLowerCase()); }); const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)); const visibleEvents = filtered.slice((page - 1) * pageSize, page * pageSize); function exportCsv() { const header = ['Hora', 'Tipo', 'ERI', 'Persona', 'Localidad', 'Dispositivo', 'Estado', 'Operador']; const rows = filtered.map((event) => [event.createdAt ? new Date(event.createdAt).toLocaleDateString('es-AR') : event.time, event.type, event.eri, event.person, event.location, event.device, event.status, event.operator]); const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'libro-de-guardia-historial.csv'; link.click(); URL.revokeObjectURL(url) } return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> REGISTRO HISTÓRICO</div><h1>Historial</h1><p>Todos los eventos registrados, incluidos los resueltos.</p></div><div className="guard-actions"><button className="secondary-button" onClick={exportCsv}><Download /> Exportar CSV</button><label className="date-filter">Desde<input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1) }} /></label><label className="date-filter">Hasta<input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1) }} /></label></div></div><section className="events-section"><div className="table-toolbar"><div className="search-box"><Search /><input aria-label="Buscar en el historial" placeholder="Buscar en el historial..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div><label className="date-filter">Desde<input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1) }} /></label><label className="date-filter">Hasta<input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1) }} /></label><div className="filter-tabs">{(['Todos', 'Pendiente', 'En seguimiento', 'Resuelto'] as const).map((item) => <button key={item} className={status === item ? 'filter-tab active' : 'filter-tab'} onClick={() => { setStatus(item); setPage(1) }}>{item}</button>)}</div><span className="result-count">{filtered.length} novedades</span></div><EventTable events={visibleEvents} onSelect={onSelect} /><div className="history-pagination" aria-label="Paginación del historial"><span>Mostrando {filtered.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filtered.length)} de {filtered.length}</span><div><button className="secondary-button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, page - 3), page + 2).map((item) => <button key={item} className={item === page ? 'filter-tab active' : 'filter-tab'} onClick={() => setPage(item)}>{item}</button>)}<button className="secondary-button" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente</button></div></div></section></> }
function PeopleView({ people, onPeopleChange }: { people: Person[]; onPeopleChange: (people: Person[], changed?: { previous?: Person; updated: Person }) => void }) { const [query, setQuery] = useState(''); const [editing, setEditing] = useState<Person | null>(null); const [adding, setAdding] = useState(false); const filtered = people.filter((person) => `${person.name} ${person.eri} ${person.device} ${person.location} ${person.status}`.toLowerCase().includes(query.toLowerCase())); async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const values = { name: String(data.get('name') || ''), eri: String(data.get('eri') || ''), location: String(data.get('location') || ''), device: String(data.get('device') || ''), status: String(data.get('status') || 'ACTIVO') }; if (editing) { const previous = editing; const updated = mapPerson(await api.updatePerson(editing.id, values)); onPeopleChange(people.map((item) => item.id === editing.id ? updated : item), { previous, updated }); } else { const created = mapPerson(await api.createPerson(values)); onPeopleChange([created, ...people], { updated: created }); } setEditing(null); setAdding(false); event.currentTarget.reset(); } return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> BASE LOCAL AUTORIZADA</div><h1>Personas y dispositivos</h1><p>Consulta de registros disponibles para crear novedades.</p></div><button className="primary-button" onClick={() => setAdding(true)}><Plus /> AGREGAR PERSONA</button></div>{(adding || editing) && <form className="person-form" onSubmit={submit}><input name="name" placeholder="Nombre" defaultValue={editing?.name === 'Sin nombre' ? '' : editing?.name} /><input name="eri" placeholder="ERI" defaultValue={editing?.eri === 'Sin ERI' ? '' : editing?.eri} /><input name="location" placeholder="Localidad" defaultValue={editing?.location === 'Sin localidad' ? '' : editing?.location} /><input name="device" placeholder="Dispositivo" defaultValue={editing?.device === 'Sin dispositivo' ? '' : editing?.device} /><select name="status" defaultValue={editing?.status || 'ACTIVO'}><option>ACTIVO</option><option>INACTIVO</option></select><button className="primary-button" type="submit">GUARDAR</button><button className="secondary-button" type="button" onClick={() => { setEditing(null); setAdding(false) }}>CANCELAR</button></form>}<section className="people-card"><div className="table-toolbar"><div className="search-box"><Search /><input aria-label="Buscar personas y dispositivos" placeholder="Buscar por ERI, nombre o dispositivo..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="result-count">{filtered.length} de {people.length} registros</span></div><div className="people-list">{filtered.map((person) => <div className="person-row" key={person.id}><div className="person-icon"><CircleUserRound /></div><div className="person-info"><strong>{person.name}</strong><span>ERI {person.eri}</span></div><div><span className="person-label">LOCALIDAD</span><strong>{person.location}</strong></div><div><span className="person-label">DISPOSITIVO</span><strong>{person.device}</strong></div><span className={person.status === 'ACTIVO' ? 'active-label' : 'inactive-label'}>{person.status}</span><button className="row-action" onClick={() => setEditing(person)}>Modificar</button><button className="row-action danger" onClick={async () => { if (!window.confirm(`¿Eliminar a ${person.name}?`)) return; await api.deletePerson(person.id); onPeopleChange(people.filter((item) => item.id !== person.id)) }}>Eliminar</button></div>)}{!filtered.length && <div className="empty-state"><Search /><strong>No encontramos registros</strong><span>Probá con otro ERI, nombre o dispositivo.</span></div>}</div></section></> }

export { EventTable }
