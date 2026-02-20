import "package:flutter/material.dart";
import "package:flutter_svg/flutter_svg.dart";

class APIKeyScreen extends StatefulWidget {
  final Future<bool> Function(String apiKey) onSubmit;
  final String? error;

  const APIKeyScreen({super.key, required this.onSubmit, this.error});

  @override
  State<APIKeyScreen> createState() => _APIKeyScreenState();
}

class _APIKeyScreenState extends State<APIKeyScreen> {
  final TextEditingController _apiKeyController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting) {
      return;
    }

    final apiKey = _apiKeyController.text.trim();
    if (apiKey.isEmpty) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    await widget.onSubmit(apiKey);

    if (!mounted) {
      return;
    }

    setState(() {
      _isSubmitting = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              scheme.surfaceContainerLow,
              scheme.surface,
              scheme.surfaceContainerHigh,
            ],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -80,
              right: -20,
              child: _GlowDisc(
                color: scheme.tertiary.withValues(alpha: 0.18),
                size: 240,
              ),
            ),
            Positioned(
              bottom: -120,
              left: -60,
              child: _GlowDisc(
                color: scheme.secondary.withValues(alpha: 0.14),
                size: 280,
              ),
            ),
            SafeArea(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: const Duration(milliseconds: 700),
                      curve: Curves.easeOutCubic,
                      builder: (context, value, child) {
                        return Transform.translate(
                          offset: Offset(0, (1 - value) * 24),
                          child: Opacity(opacity: value, child: child),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: scheme.surfaceContainerLow.withValues(
                            alpha: 0.94,
                          ),
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.08),
                              blurRadius: 28,
                              offset: const Offset(0, 16),
                            ),
                          ],
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                SvgPicture.asset(
                                  'assets/arcnem-logo.svg',
                                  height: 40,
                                  width: 40,
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  "Arcnem Vision",
                                  style: theme.textTheme.headlineMedium,
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              "Connect your API key to unlock document search, camera capture, and visual similarity results.",
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(height: 20),
                            TextField(
                              controller: _apiKeyController,
                              decoration: const InputDecoration(
                                labelText: "API Key",
                                prefixIcon: Icon(Icons.key_rounded),
                              ),
                              autocorrect: false,
                              enableSuggestions: false,
                              onSubmitted: (_) => _submit(),
                            ),
                            const SizedBox(height: 14),
                            ElevatedButton.icon(
                              onPressed: _isSubmitting ? null : _submit,
                              icon: _isSubmitting
                                  ? SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: scheme.onPrimary,
                                      ),
                                    )
                                  : const Icon(Icons.arrow_forward_rounded),
                              label: Text(
                                _isSubmitting ? "Verifying..." : "Continue",
                              ),
                            ),
                            if (widget.error != null &&
                                widget.error!.isNotEmpty) ...[
                              const SizedBox(height: 14),
                              DecoratedBox(
                                decoration: BoxDecoration(
                                  color: scheme.errorContainer,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Text(
                                    widget.error!,
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: scheme.onErrorContainer,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GlowDisc extends StatelessWidget {
  final Color color;
  final double size;

  const _GlowDisc({required this.color, required this.size});

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
