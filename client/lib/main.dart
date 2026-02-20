import 'package:arcnem_vision_client/enums/auth_status.dart';
import 'package:arcnem_vision_client/providers/auth_provider.dart';
import 'package:arcnem_vision_client/screens/api_key_screen.dart';
import 'package:arcnem_vision_client/screens/dashboard_screen.dart'
    show VisionChatScreen;
import 'package:arcnem_vision_client/screens/loading_screen.dart';
import 'package:arcnem_vision_client/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await dotenv.load(fileName: '.env');
  } catch (_) {}

  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final AuthProvider _authProvider = AuthProvider();

  @override
  void dispose() {
    _authProvider.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _authProvider,
      builder: (context, _) {
        return MaterialApp(
          title: 'Arcnem Vision',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          home: _buildHome(),
        );
      },
    );
  }

  Widget _buildHome() {
    switch (_authProvider.status) {
      case AuthStatus.initial:
      case AuthStatus.loading:
        return const LoadingScreen();
      case AuthStatus.authenticated:
        return VisionChatScreen(
          session: _authProvider.session,
          onSignOut: _authProvider.signOut,
        );
      case AuthStatus.unauthenticated:
        return APIKeyScreen(
          onSubmit: _authProvider.verifyAPIKey,
          error: _authProvider.error,
        );
    }
  }
}
