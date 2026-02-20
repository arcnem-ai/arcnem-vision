import "package:flutter/material.dart";
import "package:flutter_svg/flutter_svg.dart";

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [scheme.surfaceContainer, scheme.surface],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -100,
              right: -60,
              child: _Halo(
                size: 260,
                color: scheme.tertiary.withValues(alpha: 0.16),
              ),
            ),
            Positioned(
              bottom: -90,
              left: -20,
              child: _Halo(
                size: 210,
                color: scheme.secondary.withValues(alpha: 0.16),
              ),
            ),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 92,
                    height: 92,
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerLow.withValues(alpha: 0.96),
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: scheme.outlineVariant),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: SvgPicture.asset('assets/arcnem-logo.svg'),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: scheme.primary,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    "Warming up vision model",
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "Preparing your workspace...",
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Halo extends StatelessWidget {
  final double size;
  final Color color;

  const _Halo({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      ),
    );
  }
}
