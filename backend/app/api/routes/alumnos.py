@router.get("/{alumno_id}/historico", response_model=list[HistoricoMesOut])
async def historico_alumno(
    alumno_id: int,
    meses: int = 6,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Histórico mensual del alumno: resumen + detalle de asistencias
    (con fecha, hora, duración, tipo y profesor) + cobros.

    Los cobros se agrupan por FECHA DE OPERACIÓN (no la de creación),
    para que un pago de octubre hecho en noviembre aparezca en octubre.
    """
    alumno = await db.get(Alumno, alumno_id)
    if not alumno:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    if meses < 1:
        meses = 1
    if meses > 36:
        meses = 36

    hoy = date.today()
    meses_rango = []
    for i in range(meses):
        m = hoy.month - i
        y = hoy.year
        while m <= 0:
            m += 12
            y -= 1
        meses_rango.append((y, m))

    resumenes_result = await db.execute(
        select(ResumenMensual).where(ResumenMensual.alumno_id == alumno_id)
    )
    resumenes = resumenes_result.scalars().all()

    cobros_result = await db.execute(
        select(Cobro)
        .where(Cobro.alumno_id == alumno_id)
        .order_by(Cobro.fecha_operacion)   # 👈 CAMBIO
    )
    cobros = cobros_result.scalars().all()

    asistencias_result = await db.execute(
        select(Asistencia, TipoClase, Usuario)
        .join(TipoClase, Asistencia.tipo_clase_id == TipoClase.id)
        .join(Usuario,   Asistencia.profesor_id  == Usuario.id)
        .where(Asistencia.alumno_id == alumno_id)
        .order_by(Asistencia.fecha, Asistencia.hora_inicio)
    )
    asistencias_todas = asistencias_result.all()

    resultado: list[HistoricoMesOut] = []

    for anio, mes in meses_rango:
        resumenes_mes = [r for r in resumenes if r.anio == anio and r.mes == mes]
        horas_consumidas = sum(float(r.horas_consumidas or 0) for r in resumenes_mes)
        sesiones_consumidas = sum(int(r.sesiones_consumidas or 0) for r in resumenes_mes)
        horas_contratadas = sum(float(r.horas_contratadas or 0) for r in resumenes_mes) or None
        sesiones_contratadas = sum(int(r.sesiones_contratadas or 0) for r in resumenes_mes) or None
        semanas = resumenes_mes[0].semanas_en_mes if resumenes_mes else 4

        # 👇 CAMBIO: agrupar por fecha_operacion, no por fecha
        cobros_mes = [
            c for c in cobros
            if c.fecha_operacion and c.fecha_operacion.year == anio and c.fecha_operacion.month == mes
        ]
        cobros_out = [
            CobroResumenOut(
                id=c.id,
                fecha=c.fecha,
                total=float(c.total),
                anulado=bool(c.anulado),
                notas=c.notas,
            )
            for c in cobros_mes
        ]
        cobros_validos = [c for c in cobros_mes if not c.anulado]
        recaudado = sum(float(c.total) for c in cobros_validos)

        asistencias_mes_out: list[AsistenciaItemOut] = []
        for a, tc, prof in asistencias_todas:
            if a.fecha.year == anio and a.fecha.month == mes:
                asistencias_mes_out.append(AsistenciaItemOut(
                    id              = a.id,
                    fecha           = a.fecha,
                    hora_inicio     = str(a.hora_inicio) if a.hora_inicio else None,
                    duracion_min    = a.duracion_min or 0,
                    es_sesion       = bool(a.es_sesion),
                    tipo_clase      = tc.nombre,
                    profesor_nombre = f"{prof.nombre} {prof.apellidos}",
                    categoria       = tc.categoria.value if tc.categoria else None,
                ))

        if not resumenes_mes and not cobros_mes and not asistencias_mes_out:
            continue

        if cobros_validos:
            estado = "verde"
        elif horas_consumidas > 0 or sesiones_consumidas > 0:
            estado = "rojo"
        else:
            estado = "rojo"

        resultado.append(HistoricoMesOut(
            anio                  = anio,
            mes                   = mes,
            mes_label             = f"{MESES_CORTOS[mes - 1]} {anio}",
            horas_consumidas      = horas_consumidas,
            sesiones_consumidas   = sesiones_consumidas,
            horas_contratadas     = horas_contratadas,
            sesiones_contratadas  = sesiones_contratadas,
            semanas_en_mes        = semanas,
            estado                = estado,
            cobros                = cobros_out,
            recaudado             = recaudado,
            asistencias           = asistencias_mes_out,
        ))

    return resultado