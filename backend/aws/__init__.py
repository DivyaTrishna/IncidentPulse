"""AWS-backed implementations (DynamoDB storage, Bedrock semantic matching).

Nothing in this package is imported unless config.STORAGE_BACKEND ==
"dynamodb" or config.USE_BEDROCK is True, so local mode never needs boto3
credentials to be configured.
"""
