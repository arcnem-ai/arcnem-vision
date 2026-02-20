import 'package:flutter_test/flutter_test.dart';
import 'package:arcnem_vision_client/main.dart';

void main() {
  testWidgets('shows API key auth screen by default', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MyApp());
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('Arcnem Vision'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
  });
}
