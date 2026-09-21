import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'theme/app_theme.dart';
import 'providers/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/profesor/profesor_home_screen.dart';
import 'screens/admin/admin_home_screen.dart';

void main() {
  runApp(const DoceEscalonesApp());
}

class DoceEscalonesApp extends StatelessWidget {
  const DoceEscalonesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthProvider()..init(),
      child: MaterialApp(
        title: '12 Escalones',
        debugShowCheckedModeBanner: false,
        theme: appTheme,
        home: const RootGate(),
      ),
    );
  }
}

/// Decide qué pantalla mostrar según el estado de autenticación y rol.
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, auth, _) {
        if (auth.loading) {
          return const Scaffold(
            backgroundColor: AppColors.black,
            body: Center(
              child: CircularProgressIndicator(color: AppColors.orange),
            ),
          );
        }

        if (!auth.isAuthenticated) {
          return const LoginScreen();
        }

        // Routing según rol
        if (auth.usuario!.esAdmin) {
          return const AdminHomeScreen();
        }
        return const ProfesorHomeScreen();
      },
    );
  }
}
