import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWorkbook } from './xlsx.js';
import { cashFlow, commitments, isFlow } from '../domain/reports.js';
import { portfolioSnapshot, latestPositionsMonth } from '../domain/portfolio.js';
import { shiftMonth } from '../lib/dates.js';

const NATURE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  investment_contribution: 'Aplicação',
  investment_withdrawal: 'Resgate',
  card_payment: 'Pagamento de fatura',
};

/**
 * Generates the standard report workbook and saves it in the "planilhas" folder.
 * @param {import('../storage/store.js').Store} store
 * @param {{ toMonth: string, months: number }} options
 * @returns {{ file: string, sheets: string[] }}
 */
export function exportReports(store, { toMonth, months }) {
  const data = store.data;
  const fromMonth = shiftMonth(toMonth, -(months - 1));
  const categories = new Map(data.categories.map((category) => [category.id, category]));
  const accounts = new Map(data.accounts.map((account) => [account.id, account]));

  const sheets = [
    flowSheet('Fluxo de caixa', cashFlow(data, { fromMonth, toMonth, view: 'cash' })),
    flowSheet('Gastos por competência', cashFlow(data, { fromMonth, toMonth, view: 'competence' })),
    transactionsSheet(data, fromMonth, toMonth, categories, accounts),
    commitmentsSheet(commitments(data, shiftMonth(toMonth, 1), 12)),
  ];
  const positionsMonth = latestPositionsMonth(data);
  if (positionsMonth) sheets.push(portfolioSheet(portfolioSnapshot(data, positionsMonth)));

  const file = join(store.layout.spreadsheets, `agente-financeiro-${toMonth}.xlsx`);
  writeFileSync(file, buildWorkbook(sheets));
  return { file, sheets: sheets.map((sheet) => sheet.name) };
}

function flowSheet(name, flow) {
  const categoryNames = [...new Set(flow.flatMap((month) => month.byCategory.map((item) => item.category)))].sort();
  const rows = [
    ['Receitas', ...flow.map((month) => ({ money: month.incomeCents }))],
    ['Despesas', ...flow.map((month) => ({ money: month.expenseCents }))],
    ['Resultado', ...flow.map((month) => ({ money: month.netCents }))],
    [],
    ...categoryNames.map((category) => [
      category,
      ...flow.map((month) => {
        const found = month.byCategory.find((item) => item.category === category);
        return found ? { money: found.amountCents } : null;
      }),
    ]),
  ];
  return { name, columns: [{ header: 'Categoria', width: 42 }, ...flow.map((month) => ({ header: month.month, width: 14 }))], rows };
}

function transactionsSheet(data, fromMonth, toMonth, categories, accounts) {
  const rows = data.transactions
    .filter((tx) => tx.status === 'confirmed' && tx.date.slice(0, 7) >= fromMonth && tx.date.slice(0, 7) <= toMonth)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((tx) => {
      const category = categories.get(tx.categoryId);
      return [
        { date: tx.date },
        { date: tx.cashDate },
        accounts.get(tx.accountId)?.nickname ?? '',
        tx.payee ?? '',
        tx.description,
        category ? category.group : isFlow(tx) ? 'Sem categoria' : '',
        category ? category.name : '',
        NATURE_LABELS[tx.nature] ?? tx.nature,
        tx.installment ? `${tx.installment.number}/${tx.installment.total}` : '',
        { money: tx.amountCents },
      ];
    });
  return {
    name: 'Lançamentos',
    columns: [
      { header: 'Data', width: 12 },
      { header: 'Data de caixa', width: 14 },
      { header: 'Conta', width: 20 },
      { header: 'Beneficiário', width: 28 },
      { header: 'Descrição', width: 40 },
      { header: 'Grupo', width: 20 },
      { header: 'Categoria', width: 26 },
      { header: 'Natureza', width: 20 },
      { header: 'Parcela', width: 10 },
      { header: 'Valor', width: 16 },
    ],
    rows,
  };
}

function commitmentsSheet(list) {
  const rows = list.flatMap((month) =>
    month.items.map((item) => [month.month, item.description, item.installment ?? '', { money: item.amountCents }]),
  );
  return {
    name: 'Compromissos futuros',
    columns: [{ header: 'Mês', width: 10 }, { header: 'Descrição', width: 40 }, { header: 'Parcela', width: 10 }, { header: 'Valor', width: 16 }],
    rows,
  };
}

function portfolioSheet(snapshot) {
  const rows = snapshot.assets.map((asset) => [
    asset.name ?? '',
    asset.assetClass ?? 'não classificado',
    asset.liquidity ?? '',
    { money: asset.closingCents },
    { percent: asset.share },
    asset.returnMonth === null ? null : { percent: asset.returnMonth },
    asset.return12m === null ? null : { percent: asset.return12m },
    asset.benchmark ?? '',
  ]);
  return {
    name: `Carteira ${snapshot.month}`,
    columns: [
      { header: 'Ativo', width: 40 },
      { header: 'Classe', width: 18 },
      { header: 'Liquidez', width: 14 },
      { header: 'Saldo', width: 16 },
      { header: 'Participação', width: 14 },
      { header: 'Rentab. mês', width: 14 },
      { header: 'Rentab. 12m', width: 14 },
      { header: 'Referência', width: 12 },
    ],
    rows,
  };
}
