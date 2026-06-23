import 'package:flutter_test/flutter_test.dart';
import 'package:rchat_app/app.dart';

void main() {
  testWidgets('shows the inbox and the selected conversation', (tester) async {
    await tester.pumpWidget(const RChatApp());

    expect(find.text('Сообщения'), findsOneWidget);
    expect(find.text('Марина Котова'), findsWidgets);
    expect(find.text('Тогда берём второй вариант ✨'), findsWidgets);
  });
}
