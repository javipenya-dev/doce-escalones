import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../models/models.dart';
import '../../services/data_services.dart';
import 'registrar_asistencia_screen.dart';

class ProfesorHomeScreen extends StatefulWidget {
  const ProfesorHomeScreen({super.key});

  @override
  State<ProfesorHomeScreen> createState() => _ProfesorHomeScreenState();
}

class _ProfesorHomeScreenState extends State<ProfesorHomeScreen> {
  List<dynamic> _misAsistenciasHoy = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _loading = true);
    try {
      final data = await AsistenciasService.hoy();
      setState(() => _misAsistenciasHoy = data);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error cargando datos: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final usuario = auth.usuario!;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.orange,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text('12', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 10),
            const Text('12 Escalones', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: () => auth.logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _cargar,
        color: AppColors.orange,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Saludo
              Text(
                'Hola, ${usuario.nombre} 👋',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(
                _fechaBonita(),
                style: const TextStyle(color: AppColors.greyMid, fontSize: 14),
              ),
              const SizedBox(height: 24),

              // Botón grande: registrar asistencia
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () async {
                    final registrado = await Navigator.push<bool>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const RegistrarAsistenciaScreen(),
                      ),
                    );
                    if (registrado == true) _cargar();
                  },
                  icon: const Icon(Icons.add_circle_outline, size: 22),
                  label: const Text('REGISTRAR ASISTENCIA', style: TextStyle(fontSize: 15)),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                  ),
                ),
              ),

              const SizedBox(height: 28),

              Text(
                'Hoy has registrado',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.greyMid,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 10),

              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: CircularProgressIndicator(color: AppColors.orange)),
                )
              else if (_misAsistenciasHoy.isEmpty)
                _EmptyToday()
              else
                ..._misAsistenciasHoy.map((a) => _AsistenciaCard(data: a, onCambio: _cargar)),
            ],
          ),
        ),
      ),
    );
  }

  String _fechaBonita() {
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    final hoy = DateTime.now();
    return '${dias[hoy.weekday - 1]}, ${hoy.day} de ${meses[hoy.month - 1]}';
  }
}

class _EmptyToday extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 40),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: const Column(
        children: [
          Text('📋', style: TextStyle(fontSize: 36)),
          SizedBox(height: 10),
          Text('Aún no has registrado clases hoy',
              style: TextStyle(color: AppColors.greyMid, fontSize: 14)),
        ],
      ),
    );
  }
}

class _AsistenciaCard extends StatefulWidget {
  final dynamic data;
  final VoidCallback onCambio;
  const _AsistenciaCard({required this.data, required this.onCambio});

  @override
  State<_AsistenciaCard> createState() => _AsistenciaCardState();
}

class _AsistenciaCardState extends State<_AsistenciaCard> {
  bool _procesando = false;

  String _horaFinCalculada() {
    final horaInicioStr = widget.data['hora_inicio'] as String?;
    final duracion = widget.data['duracion_min'] as int? ?? 0;
    if (horaInicioStr == null) return '';

    final partes = horaInicioStr.split(':');
    final inicioMin = int.parse(partes[0]) * 60 + int.parse(partes[1]);
    final finMin = (inicioMin + duracion) % (24 * 60);
    final h = (finMin ~/ 60).toString().padLeft(2, '0');
    final m = (finMin % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  Future<void> _confirmarEliminar() async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar asistencia?'),
        content: Text(
          'Se eliminará la clase de ${widget.data['alumno_nombre']} y se '
          'recalculará su resumen del mes.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar', style: TextStyle(color: AppColors.rojo)),
          ),
        ],
      ),
    );
    if (confirmado != true) return;

    setState(() => _procesando = true);
    try {
      await AsistenciasService.eliminar(widget.data['id']);
      widget.onCambio();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo eliminar: $e'), backgroundColor: AppColors.rojo),
        );
      }
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  Future<void> _editarDuracion() async {
    final horaInicioStr = widget.data['hora_inicio'] as String? ?? '09:00:00';
    final partes = horaInicioStr.split(':');
    final horaInicioActual = TimeOfDay(hour: int.parse(partes[0]), minute: int.parse(partes[1]));

    final nuevaHoraFin = await showTimePicker(
      context: context,
      initialTime: horaInicioActual,
      helpText: 'Nueva hora de fin',
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.orange),
        ),
        child: child!,
      ),
    );
    if (nuevaHoraFin == null) return;

    final inicioMin = horaInicioActual.hour * 60 + horaInicioActual.minute;
    var finMin = nuevaHoraFin.hour * 60 + nuevaHoraFin.minute;
    if (finMin < inicioMin) finMin += 24 * 60;
    final nuevaDuracion = finMin - inicioMin;

    if (nuevaDuracion <= 0 || nuevaDuracion > 240) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Duración no válida'), backgroundColor: AppColors.rojo),
        );
      }
      return;
    }

    setState(() => _procesando = true);
    try {
      await AsistenciasService.actualizar(widget.data['id'], duracionMin: nuevaDuracion);
      widget.onCambio();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo editar: $e'), backgroundColor: AppColors.rojo),
        );
      }
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final categoria = widget.data['categoria'] ?? 'normal';
    final icono = categoria == 'ingles' ? '🇬🇧' : (categoria == 'sesion' ? '🏥' : '📚');
    final horaInicio = widget.data['hora_inicio'] != null
        ? (widget.data['hora_inicio'] as String).substring(0, 5)
        : '';
    final horaFin = _horaFinCalculada();
    final duracionH = ((widget.data['duracion_min'] as int? ?? 0) / 60).toStringAsFixed(1);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: Row(
        children: [
          Text(icono, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.data['alumno_nombre'] ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                Text(
                  widget.data['tipo_clase'] ?? '',
                  style: const TextStyle(color: AppColors.greyMid, fontSize: 12),
                ),
              ],
            ),
          ),
          Text(
            horaFin.isNotEmpty ? '$horaInicio - $horaFin ($duracionH h)' : horaInicio,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
              color: AppColors.greyMid,
            ),
          ),
          if (widget.data['sincronizado'] == false) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('OFFLINE',
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF92400E))),
            ),
          ],
          if (_procesando)
            const Padding(
              padding: EdgeInsets.only(left: 8),
              child: SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.orange),
              ),
            )
          else
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, size: 18, color: AppColors.greyMid),
              onSelected: (v) {
                if (v == 'editar') _editarDuracion();
                if (v == 'eliminar') _confirmarEliminar();
              },
              itemBuilder: (ctx) => const [
                PopupMenuItem(value: 'editar', child: Text('Corregir hora')),
                PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
              ],
            ),
        ],
      ),
    );
  }
}