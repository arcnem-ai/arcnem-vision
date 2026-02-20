import 'package:arcnem_vision_client/models/document.dart';
import 'package:arcnem_vision_client/services/auth_service.dart';
import 'package:arcnem_vision_client/services/http_response_utils.dart';
import 'package:fpdart/fpdart.dart';
import 'package:http/http.dart' as http;

class DocumentService {
  final AuthService _authService = AuthService();

  TaskEither<String, Map<String, dynamic>> _expectSuccessJson(
    http.Response response, {
    required String action,
  }) {
    if (response.statusCode != 200) {
      return TaskEither.left(
        extractErrorMessageFromResponse(
          response,
          fallbackMessage: '$action failed with status ${response.statusCode}',
        ),
      );
    }

    return TaskEither.fromEither(
      decodeJsonObject(
        response.body,
        emptyBodyMessage: '$action failed: response body was empty',
        invalidJsonMessage: '$action failed: response body was not valid JSON',
      ),
    );
  }

  TaskEither<String, DocumentListResponse> listDocuments({
    int limit = 20,
    String? cursor,
  }) {
    final queryParams = <String, String>{'limit': '$limit'};
    if (cursor != null) queryParams['cursor'] = cursor;
    final query = Uri(queryParameters: queryParams).query;

    return _authService
        .makeAuthenticatedRequest(
          method: 'GET',
          endpoint: '/api/documents?$query',
        )
        .flatMap(
          (response) => _expectSuccessJson(
            response,
            action: 'List documents',
          ).map(DocumentListResponse.fromJson),
        );
  }

  TaskEither<String, Document> getDocument(String id) {
    return _authService
        .makeAuthenticatedRequest(method: 'GET', endpoint: '/api/documents/$id')
        .flatMap(
          (response) => _expectSuccessJson(
            response,
            action: 'Get document',
          ).map(Document.fromJson),
        );
  }

  TaskEither<String, List<SimilarDocument>> getSimilarDocuments(
    String id, {
    int limit = 5,
  }) {
    return _authService
        .makeAuthenticatedRequest(
          method: 'GET',
          endpoint: '/api/documents/$id/similar?limit=$limit',
        )
        .flatMap((response) {
          return _expectSuccessJson(
            response,
            action: 'Similar documents search',
          ).flatMap((json) {
            final rawMatches = json['matches'];
            if (rawMatches is! List<dynamic>) {
              return TaskEither.left(
                'Similar documents failed: invalid response payload (matches is missing)',
              );
            }

            return TaskEither.fromEither(
              Either.tryCatch(
                () => rawMatches
                    .map(
                      (entry) => SimilarDocument.fromJson(
                        entry as Map<String, dynamic>,
                      ),
                    )
                    .toList(),
                (error, _) =>
                    'Similar documents failed: invalid response payload | error: $error',
              ),
            );
          });
        });
  }
}
