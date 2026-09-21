import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../models/models.dart';
import '../../services/data_services.dart';

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _ahora;
  List<AlumnoDashboard> _resumenMes = [];
  List<AlumnoDashboard> _alertas = [];

  bool _loadingStats = true;
  bool _loadingAhora = true;
  bool _loadingMes = true;
  bool _loadingAlertas = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _cargarTodo();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _cargarTodo() async {
    _cargarStats();
    _cargarAhora();
    _cargarMes();
    _cargarAlertas();
  }

  Future<void> _cargarStats() async {
    setState(() => _loadingStats = true);
    try {
      final data = await DashboardService.stats();
      setState(() => _stats = data);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingStats = false);
    }
  }

  Future<void> _cargarAhora() async {
    setState(() => _loadingAhora = true);
    try {
      final data = await DashboardService.ahora();
      setState(() => _ahora = data);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingAhora = false);
    }
  }

  Future<void> _cargarMes() async {
    setState(() => _loadingMes = true);
    try {
      final data = await DashboardService.mes();
      setState(() => _resumenMes = data);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingMes = false);
    }
  }

  Future<void> _cargarAlertas() async {
    setState(() => _loadingAlertas = true);
    try {
      final data = await DashboardService.alertasSemaforo();
      setState(() => _alertas = data);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingAlertas = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      // BOTÓN DIAGNÓSTICO TEMPORAL — gigante, flotante, sin AppBar de por medio
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: Colors.red,
        onPressed: () {
          debugPrint('🔴🔴🔴 FAB LOGOUT PRESSED 🔴🔴🔴');
          auth.logout();
        },
        label: const Text('SALIR (TEST)', style: TextStyle(color: Colors.white)),
        icon: const Icon(Icons.power_settings_new, color: Colors.white),
      ),
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: AppColors.orange, borderRadius: BorderRadius.circular(8)),
              child: const Center(
                child: Text('12', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 10),
            const Text('Panel Admin', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.orange,
          unselectedLabelColor: AppColors.greyMid,
          indicatorColor: AppColors.orange,
          tabs: const [
            Tab(text: 'AHORA', icon: Icon(Icons.bolt, size: 18)),
            Tab(text: 'ESTE MES', icon: Icon(Icons.calendar_month, size: 18)),
          ],
        ),
        actions: [
          Builder(
            builder: (innerContext) {
              return TextButton(
                onPressed: () {
                  debugPrint('🔴 LOGOUT BUTTON PRESSED');
                  ScaffoldMessenger.of(innerContext).showSnackBar(
                    const SnackBar(content: Text('Cerrando sesión...'), duration: Duration(seconds: 1)),
                  );
                  innerContext.read<AuthProvider>().logout();
                },
                style: TextButton.styleFrom(
                  minimumSize: const Size(64, 48),
                ),
                child: const Icon(Icons.logout, color: AppColors.black),
              );
            },
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildTabAhora(),
          _buildTabMes(),
        ],
      ),
    );
  }

  // ── TAB "AHORA" ───────────────────────────────────────────────

  Widget _buildTabAhora() {
    return RefreshIndicator(
      onRefresh: () async {
        await _cargarStats();
        await _cargarAhora();
        await _cargarAlertas();
      },
      color: AppColors.orange,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Stat cards
            if (_loadingStats)
              const Center(child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(color: AppColors.orange),
              ))
            else if (_stats != null)
              _buildStatsGrid(_stats!),

            const SizedBox(height: 20),

            // Alertas semáforo
            _SectionTitle(icon: '⚠️', texto: 'Alertas (${_alertas.length})'),
            const SizedBox(height: 10),
            if (_loadingAlertas)
              const Center(child: CircularProgressIndicator(color: AppColors.orange))
            else if (_alertas.isEmpty)
              const _EmptyBox(icon: '✅', texto: 'Sin alertas pendientes')
            else
              ..._alertas.map((a) => _AlertaCard(alumno: a)),

            const SizedBox(height: 20),

            // Clases en curso ahora
            _SectionTitle(icon: '⚡', texto: 'Clases en curso ahora'),
            const SizedBox(height: 10),
            if (_loadingAhora)
              const Center(child: CircularProgressIndicator(color: AppColors.orange))
            else if (_ahora == null || (_ahora!['clases_en_curso'] as List).isEmpty)
              const _EmptyBox(icon: '🏖️', texto: 'No hay clases en curso ahora mismo')
            else
              ...(_ahora!['clases_en_curso'] as List).map((c) => _ClaseEnCursoCard(data: c)),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsGrid(Map<String, dynamic> stats) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.25,
      children: [
        _StatCard(
          icon: '👥',
          label: 'Alumnos activos',
          value: '${stats['alumnos_activos']}',
          accent: true,
        ),
        _StatCard(
          icon: '🔴',
          label: 'Pagos pendientes',
          value: '${stats['pagos_pendientes']}',
          sub: '${(stats['importe_pendiente'] as num).toStringAsFixed(0)}€',
        ),
        _StatCard(
          icon: '✅',
          label: 'Asistencias hoy',
          value: '${stats['asistencias_hoy']}',
        ),
        _StatCard(
          icon: '💶',
          label: 'Recaudado mes',
          value: '${(stats['recaudado_mes'] as num).toStringAsFixed(0)}€',
        ),
      ],
    );
  }

  // ── TAB "ESTE MES" ────────────────────────────────────────────

  Widget _buildTabMes() {
    return RefreshIndicator(
      onRefresh: _cargarMes,
      color: AppColors.orange,
      child: _loadingMes
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : _resumenMes.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    SizedBox(height: 100),
                    _EmptyBox(icon: '📅', texto: 'Sin actividad este mes'),
                  ],
                )
              : ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  itemCount: _resumenMes.length,
                  itemBuilder: (context, i) => _AlumnoMesCard(alumno: _resumenMes[i]),
                ),
    );
  }
}

// ── WIDGETS AUXILIARES ────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  final String icon;
  final String texto;
  const _SectionTitle({required this.icon, required this.texto});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(icon, style: const TextStyle(fontSize: 16)),
        const SizedBox(width: 6),
        Text(texto, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      ],
    );
  }
}

class _EmptyBox extends StatelessWidget {
  final String icon;
  final String texto;
  const _EmptyBox({required this.icon, required this.texto});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: Column(
        children: [
          Text(icon, style: const TextStyle(fontSize: 32)),
          const SizedBox(height: 8),
          Text(texto, style: const TextStyle(color: AppColors.greyMid, fontSize: 13)),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String icon;
  final String label;
  final String value;
  final String? sub;
  final bool accent;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    this.sub,
    this.accent = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: accent ? AppColors.orange : AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent ? AppColors.orange : AppColors.greyBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(icon, style: const TextStyle(fontSize: 18)),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800,
              color: accent ? Colors.white : AppColors.black,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.w600,
              color: accent ? Colors.white70 : AppColors.greyMid,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                sub!,
                style: TextStyle(fontSize: 9, color: accent ? Colors.white60 : AppColors.greyLight),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }
}

class _AlertaCard extends StatelessWidget {
  final AlumnoDashboard alumno;
  const _AlertaCard({required this.alumno});

  @override
  Widget build(BuildContext context) {
    final color = colorEstado(alumno.estado);
    final bg = colorEstadoBg(alumno.estado);

    String msg;
    switch (alumno.estado) {
      case 'rojo':
        msg = alumno.importeDebido != null
            ? 'Falta cobro (≈${alumno.importeDebido!.toStringAsFixed(0)}€)'
            : 'Actividad sin cobro';
        break;
      case 'amarillo':
        msg = 'Pack agotado (${alumno.horasMes.toStringAsFixed(1)}h)';
        break;
      case 'naranja':
        msg = 'Mes de 5 semanas — revisar horas extra';
        break;
      case 'morado':
        msg = 'Excedido del pack contratado';
        break;
      default:
        msg = '';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(alumno.nombreCompleto, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                Text(msg, style: const TextStyle(fontSize: 12, color: AppColors.greyMid)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
            child: Text(
              alumno.estado.toUpperCase(),
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClaseEnCursoCard extends StatelessWidget {
  final dynamic data;
  const _ClaseEnCursoCard({required this.data});

  @override
  Widget build(BuildContext context) {
    final alumnos = data['alumnos'] as List;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('👩‍🏫 ${data['profesor_nombre']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const Spacer(),
              if (data['hora_inicio'] != null)
                Text(
                  (data['hora_inicio'] as String).substring(0, 5),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.greyMid),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(data['tipo_clase'] ?? '', style: const TextStyle(fontSize: 12, color: AppColors.greyMid)),
          const SizedBox(height: 8),
          ...alumnos.map((al) {
            final estado = al['estado'] ?? 'verde';
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: colorEstado(estado), shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Expanded(child: Text('${al['nombre']} ${al['apellidos']}', style: const TextStyle(fontSize: 13))),
                  Text('${(al['horas_mes'] as num).toStringAsFixed(1)}h', style: const TextStyle(fontSize: 11, color: AppColors.greyMid)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _AlumnoMesCard extends StatelessWidget {
  final AlumnoDashboard alumno;
  const _AlumnoMesCard({required this.alumno});

  @override
  Widget build(BuildContext context) {
    final color = colorEstado(alumno.estado);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppColors.orangePale,
            child: Text(
              alumno.nombre.isNotEmpty ? alumno.nombre[0].toUpperCase() : '?',
              style: const TextStyle(color: AppColors.orange, fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(alumno.nombreCompleto, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
          if (alumno.horasContratadas != null)
            Text(
              '${alumno.horasMes.toStringAsFixed(1)}/${alumno.horasContratadas!.toStringAsFixed(1)}h',
              style: const TextStyle(fontSize: 12, color: AppColors.greyMid),
            )
          else
            Text('${alumno.sesionesMes} ses.', style: const TextStyle(fontSize: 12, color: AppColors.greyMid)),
          const SizedBox(width: 8),
          Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        ],
      ),
    );
  }
}