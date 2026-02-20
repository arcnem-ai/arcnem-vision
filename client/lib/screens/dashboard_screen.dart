import 'package:arcnem_vision_client/catalog/vision_catalog.dart';
import 'package:arcnem_vision_client/screens/camera_screen.dart';
import 'package:arcnem_vision_client/services/gemma_service.dart';
import 'package:arcnem_vision_client/services/upload_service.dart';
import 'package:arcnem_vision_client/services/vision_content_generator.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:genui/genui.dart';

class VisionChatScreen extends StatefulWidget {
  final Map<String, dynamic>? session;
  final Future<void> Function() onSignOut;

  const VisionChatScreen({
    super.key,
    required this.session,
    required this.onSignOut,
  });

  @override
  State<VisionChatScreen> createState() => _VisionChatScreenState();
}

class _VisionChatScreenState extends State<VisionChatScreen> {
  final UploadService _uploadService = UploadService();
  final GemmaService _gemmaService = GemmaService();
  final TextEditingController _textController = TextEditingController();

  late final A2uiMessageProcessor _messageProcessor;
  late final VisionContentGenerator _contentGenerator;
  late final GenUiConversation _conversation;

  final List<String> _surfaceIds = [];
  bool _isUploading = false;
  bool _gemmaLoading = true;

  @override
  void initState() {
    super.initState();

    final catalog = createVisionCatalog();
    _messageProcessor = A2uiMessageProcessor(catalogs: [catalog]);

    _contentGenerator = VisionContentGenerator(gemmaService: _gemmaService);

    _conversation = GenUiConversation(
      a2uiMessageProcessor: _messageProcessor,
      contentGenerator: _contentGenerator,
      onSurfaceAdded: _onSurfaceAdded,
      onSurfaceDeleted: _onSurfaceDeleted,
    );

    _initializeGemma();
  }

  Future<void> _initializeGemma() async {
    final result = await _gemmaService.initialize().run();
    if (!mounted) return;
    result.fold((_) {
      // Gemma failed to load - keyword fallback will be used.
    }, (_) {});
    setState(() => _gemmaLoading = false);
  }

  void _onSurfaceAdded(SurfaceAdded event) {
    if (!mounted) return;
    setState(() {
      _surfaceIds.add(event.surfaceId);
    });
  }

  void _onSurfaceDeleted(SurfaceRemoved event) {
    if (!mounted) return;
    setState(() {
      _surfaceIds.remove(event.surfaceId);
    });
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    _textController.clear();
    _conversation.sendRequest(UserMessage([TextPart(text)]));
  }

  Future<void> _captureAndUpload() async {
    final xfile = await Navigator.of(
      context,
    ).push<XFile>(MaterialPageRoute(builder: (_) => const CameraScreen()));

    if (xfile == null || !mounted) return;

    setState(() => _isUploading = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Uploading photo...'),
        duration: Duration(seconds: 30),
      ),
    );

    final bytes = await xfile.readAsBytes();
    final result = await _uploadService
        .uploadImage(bytes: bytes, contentType: 'image/jpeg')
        .run();

    if (!mounted) return;

    ScaffoldMessenger.of(context).hideCurrentSnackBar();

    result.fold(
      (error) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Upload failed: $error')));
      },
      (data) {
        final documentId = data['documentId'] ?? 'unknown';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload complete. Document: $documentId')),
        );
      },
    );

    setState(() => _isUploading = false);
  }

  @override
  void dispose() {
    _conversation.dispose();
    _gemmaService.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            SvgPicture.asset('assets/arcnem-logo.svg', height: 32, width: 32),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Arcnem Vision', style: theme.textTheme.titleLarge),
                Text(
                  _gemmaLoading
                      ? 'Model warmup in progress'
                      : 'Ready to analyze',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: widget.onSignOut,
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              scheme.surfaceContainerLowest,
              scheme.surface,
              scheme.surfaceContainerLow,
            ],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -120,
              right: -80,
              child: _GlowSphere(
                size: 300,
                color: scheme.tertiary.withValues(alpha: 0.12),
              ),
            ),
            Positioned(
              bottom: 40,
              left: -100,
              child: _GlowSphere(
                size: 260,
                color: scheme.secondary.withValues(alpha: 0.13),
              ),
            ),
            Column(
              children: [
                if (_gemmaLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: LinearProgressIndicator(minHeight: 2),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                  child: _InfoBand(
                    title: 'Assistant workspace',
                    subtitle: _surfaceIds.isEmpty
                        ? 'Ask a question or capture an image to begin.'
                        : '${_surfaceIds.length} response cards in this thread.',
                    trailing: _isUploading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.bolt_rounded),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerLow.withValues(
                          alpha: 0.76,
                        ),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: scheme.outlineVariant),
                      ),
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 280),
                        switchInCurve: Curves.easeOut,
                        switchOutCurve: Curves.easeIn,
                        child: _surfaceIds.isEmpty
                            ? _buildEmptyState(theme, scheme)
                            : _buildMessages(theme),
                      ),
                    ),
                  ),
                ),
                ValueListenableBuilder<bool>(
                  valueListenable: _contentGenerator.isProcessing,
                  builder: (context, processing, _) {
                    if (!processing) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: const LinearProgressIndicator(minHeight: 4),
                      ),
                    );
                  },
                ),
                _Composer(
                  textController: _textController,
                  isUploading: _isUploading,
                  onCapturePressed: _captureAndUpload,
                  onSendPressed: _sendMessage,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme, ColorScheme scheme) {
    return Center(
      key: const ValueKey('empty-state'),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 74,
              height: 74,
              decoration: BoxDecoration(
                color: scheme.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.document_scanner_outlined,
                color: scheme.onPrimaryContainer,
                size: 32,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              _gemmaLoading
                  ? 'Loading AI model...'
                  : 'Start by asking a question or uploading a document image.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessages(ThemeData theme) {
    return ListView.builder(
      key: const ValueKey('messages'),
      reverse: true,
      padding: const EdgeInsets.all(14),
      itemCount: _surfaceIds.length,
      itemBuilder: (context, index) {
        final reversedIndex = _surfaceIds.length - 1 - index;
        final surfaceId = _surfaceIds[reversedIndex];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            builder: (context, value, child) {
              return Transform.translate(
                offset: Offset(0, (1 - value) * 10),
                child: Opacity(opacity: value, child: child),
              );
            },
            child: GenUiSurface(host: _messageProcessor, surfaceId: surfaceId),
          ),
        );
      },
    );
  }
}

class _InfoBand extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget trailing;

  const _InfoBand({
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleSmall),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: IconTheme(
                data: IconThemeData(color: scheme.onPrimaryContainer, size: 18),
                child: trailing,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController textController;
  final bool isUploading;
  final VoidCallback onSendPressed;
  final Future<void> Function() onCapturePressed;

  const _Composer({
    required this.textController,
    required this.isUploading,
    required this.onSendPressed,
    required this.onCapturePressed,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerLow.withValues(alpha: 0.95),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: scheme.outlineVariant),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 14,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              IconButton.filledTonal(
                onPressed: isUploading ? null : onCapturePressed,
                icon: isUploading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.camera_alt_rounded),
                tooltip: 'Capture image',
              ),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: textController,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => onSendPressed(),
                  decoration: const InputDecoration(
                    hintText: 'Ask about your documents...',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 10,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 2),
              IconButton.filled(
                onPressed: onSendPressed,
                icon: const Icon(Icons.send_rounded),
                tooltip: 'Send',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlowSphere extends StatelessWidget {
  final double size;
  final Color color;

  const _GlowSphere({required this.size, required this.color});

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
