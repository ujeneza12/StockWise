import React, { useState, useEffect } from 'react';
import { FileText, Download, Calendar, RefreshCw, Package, AlertCircle, CreditCard, Database, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, DailyReportStorage, generateDailyReport, getDailyReportForDate, clearCache } from '../lib/supabase';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface DailyReportData {
  no: number;
  libelle: string;
  stock: number;
  entres: number;
  totalJour: number;
  solde: number;
  sortie: number;
  pUnit1: number;
  pTotal: number;
  amavide: number;
  productId: string;
}

export default function DailyReports() {
  const { user } = useAuth();
  const [reportData, setReportData] = useState<DailyReportData[]>([]);
  const [creditsData, setCreditsData] = useState<any[]>([]);
  const [storedReports, setStoredReports] = useState<DailyReportStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isFirstDay, setIsFirstDay] = useState(false);
  const [adjustmentsFound, setAdjustmentsFound] = useState(0);
  const [hasReportData, setHasReportData] = useState(false);
  const [useStoredData, setUseStoredData] = useState(false);

  // Security: Validate user permissions
  useEffect(() => {
    if (!user) {
      toast.error('Authentication required');
      return;
    }
  }, [user?.id]);

  useEffect(() => {
    fetchReportData();
  }, [selectedDate]);

  const getPreviousDayStock = async (productId: string, currentDate: string) => {
    try {
      const previousDate = format(subDays(new Date(currentDate), 1), 'yyyy-MM-dd');
      
      // First check stored reports for previous day
      const { data: storedReport } = await supabase
        .from('daily_reports_storage')
        .select('solde')
        .eq('product_id', productId)
        .eq('report_date', previousDate)
        .maybeSingle();

      if (storedReport) {
        return storedReport.solde;
      }

      // Fallback to stock adjustments
      const { data: historicalAdjustments, error } = await supabase
        .from('stock_adjustments')
        .select('*')
        .eq('product_id', productId)
        .lt('created_at', `${currentDate}T00:00:00.000Z`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!historicalAdjustments || historicalAdjustments.length === 0) {
        return 0;
      }
      
      const lastAdjustment = historicalAdjustments[0];
      return lastAdjustment.new_quantity;
    } catch (error) {
      return 0;
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Security: Validate user session before fetching data
      if (!user?.id) {
        throw new Error('User session invalid');
      }

      const storedData = await getDailyReportForDate(selectedDate);
      
      if (storedData && storedData.length > 0) {
        setStoredReports(storedData);
        setUseStoredData(true);
        setHasReportData(true);
        
        const convertedData: DailyReportData[] = storedData.map(item => ({
          no: item.no,
          libelle: item.libelle,
          stock: item.stock,
          entres: item.entres,
          totalJour: item.total_jour,
          solde: item.solde,
          sortie: item.sortie,
          pUnit1: item.p_unit1,
          pTotal: item.p_total,
          amavide: item.amavide,
          productId: item.product_id
        }));
        
        setReportData(convertedData);
        setAdjustmentsFound(storedData.reduce((sum, item) => sum + item.entres, 0));
      } else {
        setUseStoredData(false);
        await generateLiveReport();
      }

      await fetchCreditsForDate();
      
    } catch (error) {
      console.error('Error fetching report data:', error);
      // Security: Don't expose internal errors
      if (error instanceof Error && error.message.includes('session invalid')) {
        toast.error('Please sign in again');
        window.location.href = '/login';
      } else {
        toast.error('Error loading report data');
      }
      setHasReportData(false);
    } finally {
      setLoading(false);
    }
  };

  const generateLiveReport = async () => {
    try {
      // Security: Validate permissions
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'approved')
        .order('name');

      if (productsError) throw productsError;

      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data: adjustments, error: adjustmentsError } = await supabase
        .from('stock_adjustments')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (adjustmentsError) throw adjustmentsError;
      
      setAdjustmentsFound(adjustments?.length || 0);

      const { data: allAdjustments, error: allAdjustmentsError } = await supabase
        .from('stock_adjustments')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

      if (allAdjustmentsError) throw allAdjustmentsError;

      const firstAdjustmentDate = allAdjustments && allAdjustments.length > 0 
        ? allAdjustments[0].created_at.split('T')[0] 
        : null;
      
      const isFirstDayEver = !firstAdjustmentDate || selectedDate <= firstAdjustmentDate;
      setIsFirstDay(isFirstDayEver);

      const hasData = (products && products.length > 0) && 
                     ((adjustments && adjustments.length > 0) || isFirstDayEver);
      
      setHasReportData(hasData);

      const processedData: DailyReportData[] = await Promise.all(
        (products || []).map(async (product, index) => {
          const previousDayStock = isFirstDayEver ? 0 : await getPreviousDayStock(product.id, selectedDate);
          
          const productAdjustments = (adjustments || []).filter(adj => adj.product_id === product.id);
          
          const entres = productAdjustments
            .filter(adj => adj.adjustment_type === 'increase')
            .reduce((sum, adj) => sum + adj.quantity_adjusted, 0);

          const stock = previousDayStock;
          const totalJour = stock + entres;
          const solde = Number(product.quantity) || 0;
          const sortie = totalJour - solde;
          const pUnit1 = Number(product.price) || 0;
          const pTotal = sortie * pUnit1;
          const amavide = Math.max(0, solde - 5);

          return {
            no: index + 1,
            libelle: product.name,
            stock,
            entres,
            totalJour,
            solde,
            sortie,
            pUnit1,
            pTotal,
            amavide,
            productId: product.id
          };
        })
      );

      setReportData(processedData);
    } catch (error) {
      console.error('Error generating live report:', error);
      throw error;
    }
  };

  const fetchCreditsForDate = async () => {
    try {
      // Security: Validate user session
      if (!user?.id) {
        return;
      }

      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data: credits, error: creditsError } = await supabase
        .from('credits')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (creditsError) throw creditsError;
      setCreditsData(credits || []);
    } catch (error) {
      console.error('Error fetching credits:', error);
      setCreditsData([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchReportData();
      toast.success('Report data refreshed');
    } catch (error) {
      toast.error('Error refreshing data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleGenerateAndStore = async () => {
    setGenerating(true);
    try {
      // Security: Validate permissions
      if (!user?.id) {
        toast.error('Authentication required');
        return;
      }

      const result = await generateDailyReport(selectedDate);
      
      toast.success(`Daily report generated and stored! ${result.products_processed} products processed.`);
      
      await fetchReportData();
    } catch (error) {
      console.error('Error generating daily report:', error);
      toast.error('Error generating daily report');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportReport = () => {
    if (!hasReportData || (reportData.length === 0 && creditsData.length === 0 && adjustmentsFound === 0)) {
      toast.error(`No daily report data found for ${format(new Date(selectedDate), 'MMMM dd, yyyy')}. Please select a date with stock adjustments or credits.`);
      return;
    }

    // Security: Validate user session before export
    if (!user?.id) {
      toast.error('Authentication required for export');
      return;
    }

    try {
      const doc = new (jsPDF as any)('portrait', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('BAR LE BON SAMARITAIN', 20, 20);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('FICHE D\'EXPLOITATION/CAISSE', 20, 28);
      
      doc.setFontSize(10);
      doc.text(`DATE: ${format(new Date(selectedDate), 'dd/MM/yyyy')}`, 20, 36);
      doc.text(`Source: ${useStoredData ? 'Stored Database Report' : 'Live Generated Report'}`, 20, 42);

      // Use autoTable for better formatting
      const tableData = reportData.map(item => [
        item.no.toString(),
        item.libelle.substring(0, 20),
        item.stock.toString(),
        item.entres.toString(),
        item.totalJour.toString(),
        item.solde.toString(),
        item.sortie.toString(),
        item.pUnit1.toFixed(0),
        item.pTotal.toFixed(0),
        item.amavide.toString()
      ]);

      // Add totals row
      const totals = calculateTotals();
      tableData.push([
        'TOTAL',
        '',
        totals.totalStock.toString(),
        totals.totalEntres.toString(),
        totals.totalJour.toString(),
        totals.totalSolde.toString(),
        totals.totalSortie.toString(),
        '',
        totals.totalPTotal.toFixed(0),
        totals.totalAmavide.toString()
      ]);

      doc.autoTable({
        head: [['No', 'LIBELLE', 'Stock', 'Entres', 'Total/Jour', 'Solde', 'Sortie', 'P.Unit 1', 'P.Total', 'Amavide']],
        body: tableData,
        startY: 50,
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { halign: 'left', cellWidth: 45 },
          2: { halign: 'right', cellWidth: 15 },
          3: { halign: 'right', cellWidth: 15 },
          4: { halign: 'right', cellWidth: 20 },
          5: { halign: 'right', cellWidth: 15 },
          6: { halign: 'right', cellWidth: 15 },
          7: { halign: 'right', cellWidth: 18 },
          8: { halign: 'right', cellWidth: 18 },
          9: { halign: 'right', cellWidth: 15 }
        },
        didParseCell: function(data) {
          // Make the total row bold
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [250, 250, 250];
          }
        }
      });

      // Credits section
      if (creditsData.length > 0) {
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('2.(DETTE NOM ET PRENOM + MONTANT)', 20, finalY);

        const creditsTableData = creditsData.map((credit, index) => [
          (index + 1).toString(),
          credit.customer_name.substring(0, 25),
          Number(credit.amount).toFixed(0)
        ]);

        // Add credits total
        const totalCreditAmount = creditsData.reduce((sum, credit) => sum + Number(credit.amount || 0), 0);
        creditsTableData.push([
          'TOTAL',
          '',
          totalCreditAmount.toFixed(0)
        ]);

        doc.autoTable({
          head: [['No', 'NOM ET PRENOM', 'MONTANT']],
          body: creditsTableData,
          startY: finalY + 5,
          styles: {
            fontSize: 8,
            cellPadding: 2,
          },
          headStyles: {
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            1: { halign: 'left', cellWidth: 60 },
            2: { halign: 'right', cellWidth: 25 }
          },
          didParseCell: function(data) {
            // Make the total row bold
            if (data.row.index === creditsTableData.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [250, 250, 250];
            }
          }
        });
      }

      const footerY = pageHeight - 30;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(`Generated by: ${user?.full_name}`, 20, footerY);
      doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, footerY + 5);
      doc.text(`Data source: ${useStoredData ? 'Database Storage' : 'Live Generation'}`, 20, footerY + 10);
      doc.text('RGBUSS Business Management System', pageWidth - 20, footerY, { align: 'right' });

      const fileName = `daily-report-${selectedDate}.pdf`;
      doc.save(fileName);

      toast.success('Daily report exported as PDF successfully!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Error exporting PDF report');
    }
  };

  const calculateTotals = () => {
    return {
      totalStock: reportData.reduce((sum, item) => sum + Number(item.stock || 0), 0),
      totalEntres: reportData.reduce((sum, item) => sum + Number(item.entres || 0), 0),
      totalJour: reportData.reduce((sum, item) => sum + Number(item.totalJour || 0), 0),
      totalSolde: reportData.reduce((sum, item) => sum + Number(item.solde || 0), 0),
      totalSortie: reportData.reduce((sum, item) => sum + Number(item.sortie || 0), 0),
      totalPTotal: reportData.reduce((sum, item) => sum + Number(item.pTotal || 0), 0),
      totalAmavide: reportData.reduce((sum, item) => sum + Number(item.amavide || 0), 0)
    };
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8 w-full min-w-0">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900">Daily Reports</h1>
          <p className="text-gray-600 lg:text-lg">Comprehensive daily inventory and sales report</p>
          <div className="flex items-center space-x-4 mt-2 lg:mt-3">
            <p className="text-sm lg:text-base text-green-600">
              📊 {useStoredData ? 'Showing stored database report' : 'Showing live generated report'}
            </p>
            <span className="text-gray-300">•</span>
            <p className="text-sm lg:text-base text-blue-600">
              📈 {adjustmentsFound} adjustments found for {selectedDate}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 lg:gap-4">
          <div className="flex items-center space-x-2 lg:space-x-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 lg:px-4 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {!useStoredData && (
            <button
              onClick={handleGenerateAndStore}
              disabled={generating}
              className="inline-flex items-center px-3 py-2 lg:px-4 lg:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Database className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Storing...' : 'Generate & Store'}
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 lg:px-4 lg:py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleExportReport}
            className="inline-flex items-center px-4 py-2 lg:px-6 lg:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      <div className={`p-4 rounded-lg border ${
        useStoredData 
          ? 'bg-green-50 border-green-200' 
          : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex">
          {useStoredData ? (
            <Database className="h-5 w-5 text-green-400 mt-0.5" />
          ) : (
            <Clock className="h-5 w-5 text-blue-400 mt-0.5" />
          )}
          <div className="ml-3">
            <h3 className={`text-sm font-medium ${
              useStoredData ? 'text-green-800' : 'text-blue-800'
            }`}>
              {useStoredData ? 'Stored Database Report' : 'Live Generated Report'}
            </h3>
            <div className={`mt-2 text-sm ${
              useStoredData ? 'text-green-700' : 'text-blue-700'
            }`}>
              {useStoredData ? (
                <p>
                  This report was previously generated and stored in the database. 
                  Data is final and represents the state at the time of generation.
                </p>
              ) : (
                <div>
                  <p>
                    This report is generated live from current data. 
                    Click "Generate & Store" to save this report to the database for permanent storage.
                  </p>
                  <p className="mt-1 font-medium">
                    💡 Stored reports are automatically generated at midnight each day.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {!hasReportData && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                No Report Data Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  No daily report data found for <strong>{format(new Date(selectedDate), 'MMMM dd, yyyy')}</strong>.
                  This could mean:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>No stock adjustments were made on this date</li>
                  <li>No credits were issued on this date</li>
                  <li>No products were added or modified on this date</li>
                </ul>
                <p className="mt-2 font-medium">
                  💡 Try selecting a different date or add some stock adjustments in Sales Management first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Products</p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-900">{reportData.length}</p>
        </div>
        <div className="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Stock</p>
          <p className="text-2xl lg:text-3xl font-bold text-blue-600">
            {totals.totalStock}
          </p>
          {isFirstDay && <p className="text-xs text-blue-500">First day - all 0</p>}
        </div>
        <div className="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Entres</p>
          <p className="text-2xl lg:text-3xl font-bold text-green-600">
            {totals.totalEntres}
          </p>
          <p className="text-xs text-green-500">New products + adjustments</p>
        </div>
        <div className="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Revenue</p>
          <p className="text-2xl lg:text-3xl font-bold text-green-600">
            ${totals.totalPTotal.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Daily Report - {format(new Date(selectedDate), 'EEEE, MMMM do, yyyy')}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Generated by {user?.full_name} • {reportData.length} products
                    {useStoredData && <span className="text-green-600 ml-2">• Stored Report</span>}
                    {!useStoredData && <span className="text-blue-600 ml-2">• Live Report</span>}
                  </p>
                </div>
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
            </div>

            {reportData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p>No products found for the selected date</p>
                <p className="text-sm text-gray-400 mt-2">
                  Add products in Stock Management or submit solde entries in Sales Management
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        No
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Libelle
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Stock
                        {isFirstDay && <div className="text-xs text-blue-500 normal-case">(First day)</div>}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Entres
                        <div className="text-xs text-green-500 normal-case">(New + Adjustments)</div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Total/Jour
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Solde
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Sortie
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        P.Unit 1
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        P.Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amavide
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.map((item, index) => (
                      <tr key={item.productId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-200">
                          {item.no}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200 max-w-xs truncate">
                          {item.libelle}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          <span className={isFirstDay ? 'text-blue-600' : ''}>
                            {item.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          <span className={item.entres > 0 ? 'text-green-600 font-medium' : ''}>
                            {item.entres}
                          </span>
                          {item.entres > 0 && (
                            <div className="text-xs text-green-500">New entries</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          {item.totalJour}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          {item.solde}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          <span className={item.sortie > 0 ? 'text-red-600 font-medium' : ''}>
                            {item.sortie}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          ${Number(item.pUnit1).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                          <span className={item.pTotal > 0 ? 'text-green-600 font-medium' : ''}>
                            ${Number(item.pTotal).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <span className={item.amavide < 5 ? 'text-orange-600 font-medium' : ''}>
                            {item.amavide}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr className="font-semibold">
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                        Total
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                        {reportData.length} Products
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                        <span className={isFirstDay ? 'text-blue-600' : ''}>
                          {totals.totalStock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 border-r border-gray-200">
                        {totals.totalEntres}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                        {totals.totalJour}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                        {totals.totalSolde}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 border-r border-gray-200">
                        {totals.totalSortie}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                        -
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 border-r border-gray-200">
                        ${totals.totalPTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {totals.totalAmavide}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-orange-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    2. (DETTE NOM ET PRENOM + MONTANT)
                  </h2>
                  <p className="text-sm text-gray-600">
                    Credits issued on {format(new Date(selectedDate), 'MMM dd, yyyy')}
                  </p>
                </div>
                <CreditCard className="h-6 w-6 text-orange-600" />
              </div>
            </div>

            {creditsData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p>No credits found for this date</p>
                <p className="text-xs text-gray-400 mt-1">Credits will appear here when issued</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        No
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        NOM ET PRENOM
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MONTANT
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {creditsData.map((credit, index) => (
                      <tr key={credit.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {credit.customer_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-orange-600">
                          ${Number(credit.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  
                  <tfoot className="bg-orange-100 border-t-2 border-orange-300">
                    <tr className="font-semibold">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        Total
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {creditsData.length} Credits
                      </td>
                      <td className="px-4 py-3 text-sm text-orange-600">
                        ${creditsData.reduce((sum, credit) => sum + Number(credit.amount || 0), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}