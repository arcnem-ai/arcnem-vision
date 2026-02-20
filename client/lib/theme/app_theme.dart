import 'package:flutter/material.dart';

class AppTheme {
  static const Color _paper = Color(0xFFF8F2E8);
  static const Color _canvas = Color(0xFFF0E6D7);
  static const Color _ink = Color(0xFF201A15);
  static const Color _accent = Color(0xFFE27A1A);
  static const Color _secondary = Color(0xFF1E8A7A);
  static const Color _danger = Color(0xFFB44A3E);

  static ThemeData get lightTheme {
    final colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: _ink,
      onPrimary: _paper,
      secondary: _secondary,
      onSecondary: Colors.white,
      error: _danger,
      onError: Colors.white,
      surface: _paper,
      onSurface: _ink,
      surfaceContainerHighest: const Color(0xFFE9DDCB),
      onSurfaceVariant: const Color(0xFF50473B),
      outline: const Color(0xFF8F7E67),
      outlineVariant: const Color(0xFFD6C5AE),
      tertiary: _accent,
      onTertiary: Colors.white,
      primaryContainer: const Color(0xFF2F2821),
      onPrimaryContainer: const Color(0xFFF7EFDF),
      secondaryContainer: const Color(0xFFD5EBE8),
      onSecondaryContainer: const Color(0xFF083A34),
      errorContainer: const Color(0xFFFADAD5),
      onErrorContainer: const Color(0xFF4A120B),
      surfaceContainer: const Color(0xFFF4EBDD),
      surfaceContainerLow: const Color(0xFFFAF6EF),
      surfaceContainerLowest: Colors.white,
      surfaceContainerHigh: const Color(0xFFEEE2D1),
      scrim: Colors.black54,
      inverseSurface: const Color(0xFF2A241F),
      onInverseSurface: const Color(0xFFF9F1E4),
      inversePrimary: const Color(0xFFF6D3A6),
      shadow: Colors.black26,
      surfaceTint: _accent,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: _canvas,
      fontFamily: 'serif',
      visualDensity: VisualDensity.standard,
    );

    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        displaySmall: base.textTheme.displaySmall?.copyWith(
          fontFamily: 'serif',
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontFamily: 'serif',
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontFamily: 'serif',
          fontWeight: FontWeight.w700,
        ),
        titleMedium: base.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
        ),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.35),
        labelLarge: base.textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: _ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          fontFamily: 'serif',
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: colorScheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: colorScheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerLow,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: colorScheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: colorScheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: colorScheme.primary, width: 1.4),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colorScheme.primary,
          side: BorderSide(color: colorScheme.outline),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: colorScheme.primaryContainer,
        contentTextStyle: TextStyle(color: colorScheme.onPrimaryContainer),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
