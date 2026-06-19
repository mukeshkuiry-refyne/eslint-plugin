import { Rule } from 'eslint';
import { isEmpty } from 'lodash';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

/**
 * Mapping of known base classes to their fields to support inheritance resolution
 */
const BASE_CLASS_FIELDS: Record<string, string[]> = {
    ClientDetails: ['lenderId', 'clientId'],
    BaseLoan: [
        '_id',
        'userId',
        'appId',
        'lenderId',
        'employerId',
        'irpa',
        'pf',
        'pfPostGst',
        'loanType',
        'applicantType',
        'entitySnapshot',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'isNpa',
        'assetClassificationStatus',
        'assetClassificationHistory',
    ],
    BaseProduct: [
        '_id',
        'productName',
        'productVersion',
        'lenderId',
        'irpaRange',
        'pfInPctRange',
        'pfAmountInRange',
        'productType',
        'amountRange',
        'createdAt',
        'updatedAt',
    ],
    BaseApplication: [
        '_id',
        'userId',
        'status',
        'productId',
        'statusLog',
        'documents',
        'lenderId',
        'irpa',
        'applicationType',
        'pf',
        'pfPostGst',
        'source',
        'applicantType',
        'employerId',
        'entitySnapshot',
        'deletedAt',
        'createdAt',
        'updatedAt',
        'feeInfo',
    ],
};

/**
 * Incorrect mongoose field name found in schema
 */
const IncorrectMongooseIndexFieldNameRule: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Incorrect mongoose field name found in schema',
            recommended: false,
        },
        schema: [],
        fixable: 'code',
    },
    create(context) {
        const propertyNames: string[] = [];

        // Traverse the AST to find all property definitions inside class declarations and collect their key names
        function collectPropertyNames(node: any) {
            // Find both exported and non-exported class declarations
            const classDeclarations: any[] = [];

            for (const child of node.body) {
                if (child.type === AST_NODE_TYPES.ClassDeclaration) {
                    classDeclarations.push(child);
                } else if (
                    (child.type === AST_NODE_TYPES.ExportNamedDeclaration ||
                        child.type ===
                            AST_NODE_TYPES.ExportDefaultDeclaration) &&
                    child.declaration &&
                    child.declaration.type === AST_NODE_TYPES.ClassDeclaration
                ) {
                    classDeclarations.push(child.declaration);
                }
            }

            for (const classDecl of classDeclarations) {
                if (!classDecl) continue;

                // 1. Collect local properties
                const bodyNodes = classDecl.body?.body ?? [];
                const propertyDefinitionNodes = bodyNodes.filter(
                    (member: any) =>
                        member.type === AST_NODE_TYPES.PropertyDefinition,
                );

                for (const propertyNode of propertyDefinitionNodes) {
                    const name =
                        propertyNode.key.name ?? propertyNode.key.value;
                    if (name) {
                        propertyNames.push(name);
                    }
                }

                // 2. Collect inherited properties from known base classes
                if (
                    classDecl.superClass &&
                    classDecl.superClass.type === AST_NODE_TYPES.Identifier
                ) {
                    const superClassName = classDecl.superClass.name;
                    const inheritedFields = BASE_CLASS_FIELDS[superClassName];
                    if (inheritedFields) {
                        propertyNames.push(...inheritedFields);
                    }
                }
            }
        }

        return {
            Program() {
                const { ast } = context.getSourceCode();
                collectPropertyNames(ast);
            },
            CallExpression(node) {
                if (
                    // @ts-expect-error callee is not typed
                    node.callee?.property?.name !== 'index' ||
                    isEmpty(node.arguments)
                )
                    return;

                // finding out indexes
                // @ts-expect-error argument is not typed
                for (const property of node.arguments[0].properties) {
                    if (
                        !property ||
                        property.type !== 'Property' ||
                        !property.key
                    ) {
                        continue;
                    }

                    const indexFieldName: string =
                        property.key.value ?? property.key.name;

                    if (!indexFieldName) continue;

                    // Extract the root field name for nested fields (e.g., 'address.city' -> 'address')
                    const rootFieldName = indexFieldName.split('.')[0];

                    if (!propertyNames.includes(rootFieldName)) {
                        context.report({
                            node: node,
                            message: `Incorrect mongoose field name ${indexFieldName} found in schema`,
                        });
                    }
                }
            },
        };
    },
};
export default IncorrectMongooseIndexFieldNameRule;
